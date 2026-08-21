import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Google Places Helper Functions (Inline since we can't import node modules easily)
const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

async function fetchGoogleJson(endpoint: string, params: Record<string, any>, apiKey: string) {
  const url = new URL(`${GOOGLE_PLACES_BASE_URL}/${endpoint}/json`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  url.searchParams.append('key', apiKey);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API error: ${data.status} - ${data.error_message || ''}`);
  }
  return data;
}

async function fetchPhotoBuffer(photoReference: string, apiKey: string, maxWidth = 800) {
  const url = new URL(`${GOOGLE_PLACES_BASE_URL}/photo`);
  url.searchParams.append('maxwidth', String(maxWidth));
  url.searchParams.append('photo_reference', photoReference);
  url.searchParams.append('key', apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Failed to fetch photo: ${res.status}`);
  
  const buffer = await res.arrayBuffer();
  return { 
    buffer: new Uint8Array(buffer), 
    contentType: res.headers.get('content-type') || 'image/jpeg' 
  };
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { location, radius = 1500, maxResults = 5, visionModel = 'gemini-2.5-flash-lite' } = await req.json();

    // Configuration
    const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!googleApiKey || !geminiApiKey || !supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing server-side configuration (API Keys)');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: visionModel });

    // 1. Search Nearby Places
    console.log(`Searching nearby ${location} radius=${radius}...`);
    const searchData = await fetchGoogleJson('nearbysearch', {
      location,
      radius,
      type: 'restaurant',
    }, googleApiKey);

    const results = searchData.results.slice(0, maxResults);
    const summary = {
      totalFound: searchData.results.length,
      processed: 0,
      dishesCreated: 0,
      skippedNotFood: 0,
      errors: 0
    };

    // 1.5 Find or Create Region
    // Simple approach: Find nearest region within radius, or create new
    // In a real app, we might use PostGIS, but here we'll just check via exact coords or create new.
    // We create a deterministic key for the region to avoid duplicates if run with same params.
    const regionKey = `${location}:${radius}`;
    
    let { data: region, error: regionError } = await supabase
      .from('regions')
      .select('id')
      .eq('region_key', regionKey)
      .maybeSingle();

    if (!region) {
        const [lat, lng] = location.split(',').map(n => parseFloat(n.trim()));
        const { data: newRegion, error: createError } = await supabase
          .from('regions')
          .insert({
              region_key: regionKey,
              latitude: lat,
              longitude: lng,
              radius: radius,
              status: 'active'
          })
          .select()
          .single();
        
        if (createError) throw new Error(`Failed to create region: ${createError.message}`);
        region = newRegion;
    }

    // 2. Process each restaurant sequentially to save resources
    for (const place of results) {
      try {
        console.log(`Processing ${place.name} (${place.place_id})...`);

        // Upsert Restaurant
        const { data: restaurant, error: restError } = await supabase
          .from('restaurants')
          .upsert({
            region_id: region.id, // Link to the region
            place_id: place.place_id,
            name: place.name,
            address: place.vicinity,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            rating: place.rating,
            review_count: place.user_ratings_total,
            price_range: place.price_level ? '$'.repeat(place.price_level) : null,
            types: place.types,
            review_status: 'pending' // Set to pending for admin review
          }, { onConflict: 'place_id' }) // Assuming place_id is unique or we have a unique constraint on (region_id, place_id) - might need adjusting if schema requires region_id
          .select()
          .single();

        // Note: We aren't assigning a region_id here. Ideally we should look up or create the region first.
        // For MVP, let's let it fail if region_id is strictly required or handle it if nullable.
        // Looking at schema: region_id is nullable on restaurants? No, likely required.
        // Let's skip region logic for a second or fetch/create a region based on lat/lng bucket.
        
        if (restError) {
             console.error('Restaurant upsert error:', restError);
             // Proceeding might be risky if we need restaurant_id for dishes
             if (!restaurant) continue; 
        }

        // 3. Get Place Details for Photos
        const detailsData = await fetchGoogleJson('details', {
            place_id: place.place_id,
            fields: 'photos'
        }, googleApiKey);

        const photos = (detailsData.result.photos || []).slice(0, 3); // Limit to 3 photos per place

        for (const photo of photos) {
          try {
            // Download Photo
            const { buffer, contentType } = await fetchPhotoBuffer(photo.photo_reference, googleApiKey);

            // Vision Check
            const prompt = "Analyze this image. Return JSON: { \"is_food\": boolean, \"dish_name\": string, \"description\": string, \"confidence\": number (0-1) }. Is this a close-up photo of a specific food dish served at a restaurant? Reject if it is a picture of the building, interior, menu text, people, or raw ingredients.";
            
            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: btoa(String.fromCharCode(...buffer)),
                        mimeType: contentType
                    }
                }
            ]);
            const response = await result.response;
            const text = response.text();
            
            // Parse JSON from Gemini response (it might be wrapped in markdown code blocks)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.log('Invalid JSON from Vision:', text);
                continue;
            }
            const analysis = JSON.parse(jsonMatch[0]);

            if (analysis.is_food && analysis.confidence > 0.7) {
                 // Upload to Supabase Storage
                 const fileName = `dishes/${place.place_id}/${photo.photo_reference.substring(0, 10)}.jpg`;
                 const { error: uploadError } = await supabase.storage
                    .from('dish-images')
                    .upload(fileName, buffer, {
                        contentType,
                        upsert: true
                    });
                 
                 if (uploadError) {
                     console.error('Storage upload error:', uploadError);
                     continue;
                 }

                 const publicUrl = supabase.storage.from('dish-images').getPublicUrl(fileName).data.publicUrl;

                 // Insert Dish
                 await supabase.from('dishes').insert({
                     restaurant_id: restaurant!.id,
                     name: analysis.dish_name || 'Unknown Dish',
                     description: analysis.description,
                     image_url: publicUrl,
                     confidence_score: analysis.confidence,
                     google_photo_reference: photo.photo_reference,
                     review_status: 'pending'
                 });
                 
                 summary.dishesCreated++;
            } else {
                summary.skippedNotFood++;
                console.log(`Skipped photo (Not food/Low confidence): ${analysis.dish_name} (${analysis.confidence})`);
            }

          } catch (photoErr) {
            console.error('Error processing photo:', photoErr);
            summary.errors++;
          }
        }
        
        summary.processed++;
      } catch (err) {
        console.error(`Error processing place ${place.name}:`, err);
        summary.errors++;
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Import completed', 
        summary 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
