interface RegionSummary {
  id: string;
  status: string;
  restaurant_count: number;
  dish_count: number;
  last_refreshed_at: string | null;
}

const countActive = (regions: RegionSummary[]) =>
  regions.filter((region) => (region.status || '').toLowerCase() === 'ready').length;

const latestRefresh = (regions: RegionSummary[]) => {
  const timestamps = regions
    .map((region) => (region.last_refreshed_at ? new Date(region.last_refreshed_at).getTime() : 0))
    .filter((value) => value > 0)
    .sort((a, b) => b - a);

  if (timestamps.length === 0) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(timestamps[0])
  );
};

export default function StatsHeader({ regions }: { regions: RegionSummary[] }) {
  const totalRestaurants = regions.reduce((acc, region) => acc + (region.restaurant_count || 0), 0);
  const totalDishes = regions.reduce((acc, region) => acc + (region.dish_count || 0), 0);
  const activeRegions = countActive(regions);

  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '2.5rem',
      }}
    >
      <div className="form-card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Active regions</h3>
        <div style={{ fontSize: '2rem', fontWeight: 600 }}>{activeRegions}</div>
      </div>
      <div className="form-card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Restaurants cached</h3>
        <div style={{ fontSize: '2rem', fontWeight: 600 }}>{totalRestaurants}</div>
      </div>
      <div className="form-card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Dishes generated</h3>
        <div style={{ fontSize: '2rem', fontWeight: 600 }}>{totalDishes}</div>
      </div>
      <div className="form-card" style={{ margin: 0 }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Last refresh</h3>
        <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{latestRefresh(regions)}</div>
      </div>
    </section>
  );
}
