import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '../../../lib/supabaseAdmin';

const GOOGLE_PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';

const searchSchema = z
  .object({
    address: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    radius: z.coerce.number().int().min(100).max(50000).default(1500),
  })
  .refine((value) => !!value.address || (value.latitude !== undefined && value.longitude !== undefined), {
    message: 'Provide either an address or both latitude and longitude.',
    path: ['address'],
  });

const fetchGoogleJson = async (endpoint: string, params: Record<string, any>, apiKey: string) => {
  const url = new URL(`${GOOGLE_PLACES_BASE_URL}/${endpoint}/json`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places error: ${data.status} - ${data.error_message || 'unknown error'}`);
  }

  return data;
};

const resolveLocationFromAddress = async (address: string, apiKey: string) => {
  const data = await fetchGoogleJson(
    'findplacefromtext',
    {
      input: address,
      inputtype: 'textquery',
      fields: 'formatted_address,geometry',
    },
    apiKey,
  );

  const candidate = data.candidates?.[0];
  if (!candidate?.geometry?.location) {
    throw new Error('Unable to resolve address to a location.');
  }

  return {
    lat: candidate.geometry.location.lat,
    lng: candidate.geometry.location.lng,
    resolvedAddress: candidate.formatted_address as string,
  };
};

const normalizeCandidate = (detail: any, photoUrl: string | null) => ({
  placeId: detail.place_id,
  name: detail.name,
  address: detail.formatted_address,
  location: detail.geometry?.location,
  rating: detail.rating,
  reviewCount: detail.user_ratings_total,
  priceLevel: detail.price_level,
  websiteUrl: detail.website,
  phoneNumber: detail.formatted_phone_number,
  types: detail.types,
  status: detail.business_status,
  photoUrl,
});

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = searchSchema.parse(payload);

  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!googleApiKey) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const supabase = createAdminClient();

  try {
    const location =
      parsed.latitude !== undefined && parsed.longitude !== undefined
        ? { lat: parsed.latitude, lng: parsed.longitude }
        : await resolveLocationFromAddress(parsed.address!, googleApiKey);

    const nearby = await fetchGoogleJson(
      'nearbysearch',
      {
        location: `${location.lat},${location.lng}`,
        radius: parsed.radius,
        type: 'restaurant',
      },
      googleApiKey,
    );

    const results = nearby.results ?? [];

    const candidates = await Promise.all(
      results.slice(0, 20).map(async (result: any) => {
        const details = await fetchGoogleJson(
          'details',
          {
            place_id: result.place_id,
            fields:
              'place_id,name,formatted_address,geometry,website,formatted_phone_number,price_level,rating,user_ratings_total,types,business_status,photos',
          },
          googleApiKey,
        );

        const detail = details.result ?? result;
        const firstPhoto = detail.photos?.[0]?.photo_reference as string | undefined;
        const photoUrl = firstPhoto
          ? `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=800&photo_reference=${firstPhoto}&key=${googleApiKey}`
          : null;

        const existing = await supabase
          .from('restaurants')
          .select('id, tracked')
          .eq('place_id', detail.place_id)
          .order('updated_at', { ascending: false })
          .maybeSingle();

        const now = new Date().toISOString();
        const restaurantPayload = {
          place_id: detail.place_id,
          source_provider: 'google_places',
          source_place_id: detail.place_id,
          source_status: detail.business_status ?? nearby.status,
          last_seen_at: now,
          name: detail.name,
          address: detail.formatted_address ?? result.vicinity,
          latitude: detail.geometry?.location?.lat,
          longitude: detail.geometry?.location?.lng,
          price_range: detail.price_level ? '$'.repeat(detail.price_level) : null,
          rating: detail.rating,
          review_count: detail.user_ratings_total,
          website_url: detail.website,
          phone_number: detail.formatted_phone_number,
          place_types: detail.types,
          image_url: photoUrl,
        };

        let restaurantId = existing.data?.id ?? null;
        let tracked = existing.data?.tracked ?? false;

        if (existing.data?.id) {
          const { error } = await supabase
            .from('restaurants')
            .update(restaurantPayload)
            .eq('id', existing.data.id);

          if (error) {
            console.warn('Failed to update restaurant', { placeId: detail.place_id, error });
          } else {
            restaurantId = existing.data.id;
          }
        } else {
          const { data: insertData, error } = await supabase
            .from('restaurants')
            .insert(restaurantPayload)
            .select('id, tracked')
            .single();

          if (error) {
            console.warn('Failed to insert restaurant', { placeId: detail.place_id, error });
          } else {
            restaurantId = insertData.id;
            tracked = insertData.tracked;
          }
        }

        return {
          ...normalizeCandidate(detail, photoUrl),
          restaurantId,
          tracked,
        };
      }),
    );

    return NextResponse.json({
      origin: location,
      candidates,
    });
  } catch (error) {
    console.error('Nearby search error', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
