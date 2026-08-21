import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '../../../lib/supabaseAdmin';
import { generateRegionKey } from '@dishswipe/loader';

const regionSchema = z.object({
  name: z.string().optional().nullable(),
  latitude: z.coerce.number().refine((value) => Math.abs(value) <= 90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().refine((value) => Math.abs(value) <= 180, 'Longitude must be between -180 and 180'),
  radius: z.coerce.number().int().min(100).max(50000),
  keyword: z.string().optional().nullable(),
});

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('regions')
    .select(
      `
        id,
        name,
        latitude,
        longitude,
        radius,
        keyword,
        status,
        restaurant_count,
        dish_count,
        refresh_requested_at,
        last_refreshed_at,
        created_at,
        updated_at
      `
    )
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ regions: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = createAdminClient();

  try {
    const payload = await request.json();
    
    // Parse and validate the payload
    const parseResult = regionSchema.safeParse({
      ...payload,
      name: payload.name || null,
      keyword: payload.keyword || null,
    });

    if (!parseResult.success) {
      const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return NextResponse.json({ error: `Validation failed: ${errors}` }, { status: 400 });
    }

    const parsed = parseResult.data;

    const regionKey = generateRegionKey({
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      radius: parsed.radius,
      keyword: parsed.keyword,
    });

    const { data: regionData, error } = await supabase
      .from('regions')
      .upsert(
        {
          region_key: regionKey,
          name: parsed.name,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          radius: parsed.radius,
          keyword: parsed.keyword,
        },
        { onConflict: 'region_key' }
      )
      .select('*')
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    // Try to invoke the refresh function, but don't fail if it's not deployed
    let refreshResponse = null;
    try {
      refreshResponse = await supabase.functions.invoke('refresh-region', {
        body: {
          regionId: regionData.id,
          regionName: regionData.name,
          location: { lat: regionData.latitude, lng: regionData.longitude },
          radius: regionData.radius,
          keyword: regionData.keyword ?? undefined,
        },
      });

      if (refreshResponse.error) {
        console.warn('Refresh function error (non-fatal):', refreshResponse.error);
      }
    } catch (refreshError) {
      console.warn('Refresh function not available (non-fatal):', refreshError);
      // Continue even if refresh fails - region is still saved
    }

    return NextResponse.json({ 
      region: regionData, 
      refresh: refreshResponse?.data ?? null,
      refreshError: refreshResponse?.error ? refreshResponse.error.message : null
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
