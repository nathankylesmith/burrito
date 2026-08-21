import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '../../../../lib/supabaseAdmin';

const trackSchema = z.object({
  restaurantId: z.string().uuid(),
});

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = trackSchema.parse(payload);

  const supabase = createAdminClient();

  const { data: restaurant, error: restaurantError } = await supabase
    .from('restaurants')
    .select('id, place_id, name, tracked')
    .eq('id', parsed.restaurantId)
    .maybeSingle();

  if (restaurantError) {
    return NextResponse.json({ error: restaurantError.message }, { status: 500 });
  }

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
  }

  if (!restaurant.tracked) {
    const { error: updateError } = await supabase
      .from('restaurants')
      .update({ tracked: true, tracked_at: new Date().toISOString() })
      .eq('id', restaurant.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  const { data: existingJob, error: jobLookupError } = await supabase
    .from('menu_sync_jobs')
    .select('id, status')
    .eq('restaurant_id', restaurant.id)
    .in('status', ['queued', 'running'])
    .maybeSingle();

  if (jobLookupError) {
    return NextResponse.json({ error: jobLookupError.message }, { status: 500 });
  }

  let jobId = existingJob?.id ?? null;

  if (!existingJob) {
    const { data: newJob, error: jobError } = await supabase
      .from('menu_sync_jobs')
      .insert({
        restaurant_id: restaurant.id,
        status: 'queued',
        payload: { reason: 'admin-track' },
      })
      .select('id')
      .single();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }

    jobId = newJob.id;
  }

  return NextResponse.json({
    restaurantId: restaurant.id,
    tracked: true,
    jobId,
  });
}
