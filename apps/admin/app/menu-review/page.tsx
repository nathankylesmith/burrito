import MenuReviewTable from '../../components/MenuReviewTable';
import { createAdminClient } from '../../lib/supabaseAdmin';

const normalizeDish = (dish: any) => ({
  ...dish,
  completeness_score: dish.completeness_score ?? null,
  missing_fields: dish.missing_fields ?? {},
  needs_manual_review: !!dish.needs_manual_review,
  is_published: !!dish.is_published,
});

export default async function MenuReviewPage() {
  const supabase = createAdminClient();

  const { data: dishesData } = await supabase
    .from('dishes')
    .select(
      `
      id,
      name,
      description,
      price,
      image_url,
      source_image_url,
      cuisine_type,
      menu_section,
      completeness_score,
      missing_fields,
      needs_manual_review,
      is_published,
      review_status,
      updated_at,
      restaurant:restaurants ( id, name )
    `
    )
    .order('updated_at', { ascending: false })
    .limit(150);

  const dishes = (dishesData || []).map(normalizeDish);
  const dishIds = dishes.map((dish: any) => dish.id);

  let versions: any[] = [];
  if (dishIds.length > 0) {
    const { data: versionData } = await supabase
      .from('dish_versions')
      .select('id, dish_id, version_number, is_published, completeness_score, missing_fields, created_at')
      .in('dish_id', dishIds)
      .order('version_number', { ascending: false });
    versions = versionData || [];
  }

  return (
    <main>
      <h1>Menu Review</h1>
      <p style={{ color: 'rgba(148, 163, 184, 0.85)', marginBottom: '2rem' }}>
        Inspect synced dishes, completeness scores, and publish or rollback menu items.
      </p>
      <MenuReviewTable dishes={dishes} versions={versions} />
    </main>
  );
}
