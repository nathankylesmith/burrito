import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '../../../../lib/supabaseAdmin';

const refreshSchema = z.object({
  regionId: z.string().uuid().optional(),
  location: z
    .union([
      z.string(),
      z.object({ lat: z.number(), lng: z.number() }),
    ])
    .optional(),
  radius: z.number().optional(),
  keyword: z.string().optional(),
});

export async function POST(request: Request) {
  const supabase = createAdminClient();

  try {
    const payload = await request.json();
    const parsed = refreshSchema.parse(payload);

    let targetRegion: {
      id: string;
      name: string | null;
      latitude: number;
      longitude: number;
      radius: number;
      keyword: string | null;
    } | null = null;

    if (parsed.regionId) {
      const { data, error } = await supabase
        .from('regions')
        .select('id, name, latitude, longitude, radius, keyword')
        .eq('id', parsed.regionId)
        .single();

      if (error) {
        throw error;
      }

      targetRegion = data;
    }

    const location = parsed.location || (targetRegion && { lat: targetRegion.latitude, lng: targetRegion.longitude });

    if (!location) {
      throw new Error('A location must be provided when refreshing a region.');
    }

    const response = await supabase.functions.invoke('refresh-region', {
      body: {
        regionId: targetRegion?.id ?? parsed.regionId,
        regionName: targetRegion?.name,
        location,
        radius: parsed.radius ?? targetRegion?.radius,
        keyword: parsed.keyword ?? targetRegion?.keyword ?? undefined,
      },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return NextResponse.json(response.data ?? { status: 'ok' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
