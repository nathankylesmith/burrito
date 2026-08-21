import RegionTable from '../components/RegionTable';
import RegionForm from '../components/RegionForm';
import StatsHeader from '../components/StatsHeader';
import { createAdminClient } from '../lib/supabaseAdmin';
import Link from 'next/link';

export default async function AdminDashboard() {
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

  const regions = data || [];

  const normalizedRegions = regions.map((region: any) => ({
    ...region,
    latitude: Number(region.latitude),
    longitude: Number(region.longitude),
    radius: Number(region.radius),
    restaurant_count: Number(region.restaurant_count ?? 0),
    dish_count: Number(region.dish_count ?? 0),
  }));

  return (
    <main>
      <h1>DishSwipe Admin</h1>
      <p style={{ color: 'rgba(148, 163, 184, 0.85)', marginBottom: '2rem' }}>
        Monitor cached regions, trigger Google refreshes, and track data coverage.
      </p>
      <div style={{ marginBottom: '2rem' }}>
        <Link
          href="/menu-review"
          style={{
            padding: '0.65rem 1.1rem',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'rgba(59, 130, 246, 0.25)',
            color: '#f8fafc',
            fontWeight: 600,
          }}
        >
          Review menu syncs
        </Link>
      </div>

      <StatsHeader regions={normalizedRegions} />
      <section>
        <h2 style={{ marginBottom: '1rem' }}>Tracked Regions</h2>
        <RegionTable initialRegions={normalizedRegions} />
      </section>

      <section>
        <h2 style={{ marginBottom: '1rem' }}>Add or Update Region</h2>
        <RegionForm />
      </section>
    </main>
  );
}
