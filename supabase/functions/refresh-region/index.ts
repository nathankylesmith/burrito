import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.38.0';
import { loadRestaurantsFromGooglePlaces } from '../../../packages/loader/dist/index.js';

interface RefreshPayload {
  regionId?: string;
  regionName?: string | null;
  location?: string | { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  radius?: number;
  keyword?: string;
  maxResults?: number;
  photoBucket?: string;
  photoMaxWidth?: number;
  maxDishesPerRestaurant?: number;
  maxDishPhotosPerRestaurant?: number;
  maxReviewDishes?: number;
  dishPhotoConcurrency?: number;
  googleDetailConcurrency?: number;
  dryRun?: boolean;
}

const parseLocation = (payload: RefreshPayload) => {
  if (payload.location) {
    return payload.location;
  }

  if (payload.latitude !== undefined && payload.longitude !== undefined) {
    return { lat: payload.latitude, lng: payload.longitude };
  }

  throw new Error('A location is required (location string or latitude/longitude pair).');
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const googleApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase configuration is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!googleApiKey) {
    return new Response(JSON.stringify({ error: 'Google Maps API key is missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: RefreshPayload;

  try {
    payload = await req.json();
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const location = parseLocation(payload);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const startedAt = new Date().toISOString();
    const result = await loadRestaurantsFromGooglePlaces(supabase, {
      apiKey: googleApiKey,
      location,
      radius: payload.radius,
      keyword: payload.keyword,
      maxResults: payload.maxResults,
      regionId: payload.regionId,
      regionName: payload.regionName ?? null,
      photoBucket: payload.photoBucket,
      photoMaxWidth: payload.photoMaxWidth,
      maxDishesPerRestaurant: payload.maxDishesPerRestaurant,
      maxDishPhotosPerRestaurant: payload.maxDishPhotosPerRestaurant,
      maxReviewDishes: payload.maxReviewDishes,
      dishPhotoConcurrency: payload.dishPhotoConcurrency,
      googleDetailConcurrency: payload.googleDetailConcurrency,
      dryRun: payload.dryRun,
    });

    const completedAt = new Date().toISOString();
    const summary = {
      status: 'ok' as const,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      restaurants: result.restaurants.length,
      dishes: result.dishes.length,
      regionId: result.region?.id ?? payload.regionId ?? null,
      regionName: result.region?.name ?? payload.regionName ?? null,
      dryRun: Boolean(payload.dryRun),
    };

    return new Response(JSON.stringify({ ...summary, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to refresh region', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
