import { NextResponse } from 'next/server';
import { z } from 'zod';
import { computeDishCompleteness } from '@dishswipe/loader';
import { createAdminClient } from '../../lib/supabaseAdmin';


const payloadSchema = z.object({
  action: z.enum(['update', 'publish', 'rollback']).default('update'),
  dishId: z.string(),
  versionId: z.string().optional(),
  updates: z
    .object({
      description: z.string().optional(),
      price: z.number().optional(),
      image_url: z.string().optional(),
      needs_manual_review: z.boolean().optional(),
      is_published: z.boolean().optional(),
    })
    .optional(),
});

const loadLatestVersionNumber = async (supabase: ReturnType<typeof createAdminClient>, dishId: string) => {
  const { data } = await supabase
    .from('dish_versions')
    .select('version_number')
    .eq('dish_id', dishId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  return data?.version_number ?? 0;
};

const persistVersion = async (
  supabase: ReturnType<typeof createAdminClient>,
  dish: Record<string, any>,
  isPublished?: boolean
) => {
  const nextVersionNumber = (await loadLatestVersionNumber(supabase, dish.id)) + 1;

  const versionPayload = {
    dish_id: dish.id,
    version_number: nextVersionNumber,
    payload: dish,
    completeness_score: dish.completeness_score ?? null,
    missing_fields: dish.missing_fields ?? null,
    needs_manual_review: dish.needs_manual_review ?? false,
    is_published: isPublished ?? dish.is_published ?? false,
  };

  console.log('Persisting version:', versionPayload);

  // First try to insert
  const { error: insertError } = await supabase.from('dish_versions').insert(versionPayload);

  if (insertError) {
    // If insert failed due to unique constraint, try update
    if (insertError.code === '23505') { // unique_violation
      console.log('Version already exists, updating instead');
      const { error: updateError } = await supabase
        .from('dish_versions')
        .update({
          payload: versionPayload.payload,
          completeness_score: versionPayload.completeness_score,
          missing_fields: versionPayload.missing_fields,
          needs_manual_review: versionPayload.needs_manual_review,
          is_published: versionPayload.is_published,
        })
        .eq('dish_id', versionPayload.dish_id)
        .eq('version_number', versionPayload.version_number);

      if (updateError) {
        console.error('Failed to update existing version:', updateError);
        throw updateError;
      }
    } else {
      console.error('Failed to insert version:', insertError);
      throw insertError;
    }
  }
};

const refreshVersions = async (supabase: ReturnType<typeof createAdminClient>, dishId: string) => {
  const { data } = await supabase
    .from('dish_versions')
    .select('*')
    .eq('dish_id', dishId)
    .order('version_number', { ascending: false });
  return data ?? [];
};

const applyCompleteness = (dish: Record<string, any>, overrides: Record<string, any> = {}) => {
  const merged = { ...dish, ...overrides };
  const completeness = computeDishCompleteness({
    description: merged.description,
    imageUrl: merged.image_url,
    price: merged.price,
    optionSets: merged.option_sets ?? null,
  });

  return {
    ...merged,
    completeness_score: completeness.score,
    missing_fields: completeness.missingFields,
    needs_manual_review: overrides.needs_manual_review ?? completeness.needsManualReview,
  };
};

export async function PATCH(request: Request) {
  const supabase = createAdminClient();

  try {
    const parsed = payloadSchema.parse(await request.json());
    const { dishId, action, updates, versionId } = parsed;

    console.log('Dish update request:', { dishId, action, updates, versionId });

    if (!dishId || typeof dishId !== 'string') {
      throw new Error('Invalid dishId provided');
    }

    const { data: existingDish, error: dishError } = await supabase
      .from('dishes')
      .select('*')
      .eq('id', dishId)
      .single();

    if (dishError || !existingDish) {
      throw new Error(dishError?.message || 'Dish not found');
    }

    let updatedDish = existingDish;

    if (action === 'update') {
      const merged = applyCompleteness(existingDish, updates || {});
      console.log('Updating dish with ID:', dishId);
      const updateData = {
          ...updates,
          completeness_score: merged.completeness_score,
          missing_fields: merged.missing_fields,
          needs_manual_review: merged.needs_manual_review,
          review_status: merged.needs_manual_review ? 'changes_requested' : 'pending',
      };
      console.log('Update data:', updateData);

      const { data, error } = await supabase
        .from('dishes')
        .update(updateData)
        .eq('id', dishId)
        .select('*')
        .single();

      console.log('Update result:', { data, error });

      if (error || !data) {
        throw new Error(error?.message || 'Failed to update dish');
      }

      updatedDish = data;
      await persistVersion(supabase, updatedDish, updatedDish.is_published);
    }

    if (action === 'publish' || action === 'rollback') {
      if (!dishId) {
        throw new Error('dishId is required for publish/rollback operations');
      }

      let targetVersion = null;

      if (versionId) {
        if (!versionId) {
          throw new Error('versionId is required when provided');
        }
        const { data, error } = await supabase
          .from('dish_versions')
          .select('*')
          .eq('id', versionId)
          .single();

        if (error || !data) {
          throw new Error(error?.message || 'Version not found');
        }
        targetVersion = data;
      } else {
        const { data, error } = await supabase
          .from('dish_versions')
          .select('*')
          .eq('dish_id', dishId)
          .order('version_number', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          throw new Error(error.message);
        }
        targetVersion = data;
      }

      const payload = targetVersion?.payload || existingDish;
      const normalized = applyCompleteness(existingDish, payload);

      console.log('Publishing dish with ID:', dishId, 'versionId:', versionId);
      const { data, error } = await supabase
        .from('dishes')
        .update({
          name: normalized.name,
          description: normalized.description,
          price: normalized.price,
          image_url: normalized.image_url,
          source_image_url: normalized.source_image_url ?? normalized.image_url ?? null,
          cuisine_type: normalized.cuisine_type,
          menu_section: normalized.menu_section,
          dietary_tags: normalized.dietary_tags,
          option_sets: normalized.option_sets ?? null,
          completeness_score: normalized.completeness_score,
          missing_fields: normalized.missing_fields,
          needs_manual_review: false,
          review_status: 'approved',
          is_published: true,
        })
        .eq('id', dishId)
        .select('*')
        .single();

      console.log('Publish update result:', { data, error });

      if (error || !data) {
        throw new Error(error?.message || 'Failed to publish dish');
      }

      updatedDish = data;

      if (targetVersion?.id) {
        if (!targetVersion.id) {
          throw new Error('targetVersion.id is required for version update');
        }
        const { error: versionUpdateError } = await supabase
          .from('dish_versions')
          .update({ is_published: true })
          .eq('id', targetVersion.id);

        if (versionUpdateError) {
          throw new Error(`Failed to update version: ${versionUpdateError.message}`);
        }
      } else {
        await persistVersion(supabase, updatedDish, true);
      }
    }

    const versions = await refreshVersions(supabase, dishId);

    return NextResponse.json({ dish: updatedDish, versions });
  } catch (error) {
    console.error('Dish update failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unexpected error' },
      { status: 400 }
    );
  }
}
