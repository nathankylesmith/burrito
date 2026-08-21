'use client';

import { useCallback, useMemo, useState } from 'react';

interface Candidate {
  restaurantId: string | null;
  placeId: string;
  name: string;
  address: string;
  location?: { lat: number; lng: number };
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  websiteUrl?: string;
  phoneNumber?: string;
  types?: string[];
  status?: string;
  photoUrl?: string | null;
  tracked?: boolean;
}

const formatPrice = (price?: number) => {
  if (price === undefined || price === null) return undefined;
  return '$'.repeat(Math.max(1, price));
};

export default function RestaurantsNearbyPage() {
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [radius, setRadius] = useState(1500);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const canSearch = useMemo(
    () => (!!address || (latitude !== undefined && longitude !== undefined)) && !loading,
    [address, latitude, longitude, loading]
  );

  const requestGeolocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return;
    }

    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      () => {
        setError('Unable to retrieve your location.');
      },
    );
  }, []);

  const runSearch = useCallback(async () => {
    if (!canSearch) return;

    setLoading(true);
    setError(null);
    setCandidates([]);

    try {
      const response = await fetch('/api/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address || undefined,
          latitude,
          longitude,
          radius,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      setCandidates(data.candidates || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [address, canSearch, latitude, longitude, radius]);

  const markTracked = useCallback(
    async (restaurantId: string | null) => {
      if (!restaurantId) {
        setError('Missing restaurant identifier for tracking.');
        return;
      }

      setTracking(restaurantId);
      setError(null);

      try {
        const response = await fetch('/api/restaurants/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to mark restaurant as tracked.');
        }

        setCandidates((prev) =>
          prev.map((candidate) =>
            candidate.restaurantId === restaurantId
              ? { ...candidate, tracked: true }
              : candidate
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error while tracking restaurant.';
        setError(message);
      } finally {
        setTracking(null);
      }
    },
    [],
  );

  return (
    <main>
      <h1>Find Nearby Restaurants</h1>
      <p style={{ color: 'rgba(148, 163, 184, 0.85)', marginBottom: '1.5rem' }}>
        Use geolocation or an address to discover restaurants, review Google details, and queue menu syncs.
      </p>

      <div className="form-card" style={{ marginBottom: '1.5rem' }}>
        <div className="form-grid">
          <label>
            Address (optional)
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="1600 Amphitheatre Parkway, Mountain View, CA"
            />
          </label>
          <label>
            Latitude
            <input
              value={latitude ?? ''}
              onChange={(e) => setLatitude(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="37.4219"
            />
          </label>
          <label>
            Longitude
            <input
              value={longitude ?? ''}
              onChange={(e) => setLongitude(e.target.value ? Number(e.target.value) : undefined)}
              placeholder="-122.0840"
            />
          </label>
          <label>
            Radius (meters)
            <input
              type="number"
              min={100}
              max={50000}
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button type="button" onClick={requestGeolocation}>
            Use my location
          </button>
          <button type="button" className="primary" onClick={runSearch} disabled={!canSearch}>
            {loading ? 'Searching...' : 'Search nearby'}
          </button>
        </div>
        {error && <p style={{ color: '#f87171', marginTop: '0.75rem' }}>{error}</p>}
      </div>

      {candidates.length > 0 && (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Details</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => (
                <tr key={candidate.placeId}>
                  <td>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      {candidate.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={candidate.photoUrl}
                          alt={candidate.name}
                          style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }}
                        />
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{candidate.name}</div>
                        <div style={{ color: 'rgba(148, 163, 184, 0.9)', fontSize: '0.9rem' }}>
                          {candidate.address}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ color: 'rgba(226, 232, 240, 0.9)', fontSize: '0.9rem' }}>
                      <div>
                        {candidate.rating ? `${candidate.rating.toFixed(1)} ★` : 'No rating'}
                        {candidate.reviewCount ? ` • ${candidate.reviewCount} reviews` : ''}
                        {candidate.priceLevel !== undefined ? ` • ${formatPrice(candidate.priceLevel)}` : ''}
                      </div>
                      <div style={{ marginTop: '0.35rem' }}>
                        {candidate.status || 'status unknown'}
                        {candidate.types?.length ? ` • ${candidate.types.slice(0, 3).join(', ')}` : ''}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {candidate.websiteUrl && (
                          <a href={candidate.websiteUrl} target="_blank" rel="noreferrer" style={{ color: '#93c5fd' }}>
                            Website
                          </a>
                        )}
                        {candidate.phoneNumber && <span>{candidate.phoneNumber}</span>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {candidate.tracked ? (
                      <span className="status-pill ready">Tracked</span>
                    ) : (
                      <span className="status-pill queued">Discovered</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => markTracked(candidate.restaurantId)}
                      disabled={candidate.tracked || tracking === candidate.restaurantId}
                      className="primary"
                    >
                      {candidate.tracked ? 'Tracked' : tracking === candidate.restaurantId ? 'Enqueuing...' : 'Track & enqueue menu sync'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && candidates.length === 0 && (
        <p style={{ color: 'rgba(148, 163, 184, 0.85)' }}>
          No candidates yet. Search with coordinates or an address to find nearby restaurants.
        </p>
      )}
    </main>
  );
}
