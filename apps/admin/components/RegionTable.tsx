'use client';

import { useState } from 'react';

type Region = {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  keyword: string | null;
  status: string;
  restaurant_count: number;
  dish_count: number;
  refresh_requested_at: string | null;
  last_refreshed_at: string | null;
  updated_at: string;
};

interface RegionTableProps {
  initialRegions: Region[];
}

const formatTimestamp = (value: string | null) => {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (error) {
    console.warn('Unable to format timestamp', error);
    return value;
  }
};

const statusClass = (status: string) => {
  const normalized = status?.toLowerCase();
  if (['ready', 'complete'].includes(normalized)) return 'status-pill ready';
  if (['refreshing', 'loading', 'queued', 'pending'].includes(normalized)) return 'status-pill refreshing';
  if (['error', 'failed'].includes(normalized)) return 'status-pill error';
  return 'status-pill';
};

export default function RegionTable({ initialRegions }: RegionTableProps) {
  const [regions, setRegions] = useState(initialRegions);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState(false);

  const handleRefresh = async (region: Region) => {
    setLoadingId(region.id);
    try {
      const response = await fetch('/api/regions/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionId: region.id }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to trigger refresh');
      }

      const result = await response.json();
      if (result.region) {
        const updated: Region = {
          ...result.region,
          latitude: Number(result.region.latitude),
          longitude: Number(result.region.longitude),
          radius: Number(result.region.radius),
          restaurant_count: Number(result.region.restaurant_count ?? 0),
          dish_count: Number(result.region.dish_count ?? 0),
        };
        setRegions((prev) =>
          prev.map((item) => (item.id === region.id ? { ...item, ...updated } : item))
        );
      }
    } catch (error) {
      console.error(error);
      alert((error as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  const reloadRegions = async () => {
    setIsReloading(true);
    try {
      const response = await fetch('/api/regions');
      if (!response.ok) {
        throw new Error('Unable to reload regions');
      }
      const body = await response.json();
      const normalized: Region[] = (body.regions || []).map((region: any) => ({
        ...region,
        latitude: Number(region.latitude),
        longitude: Number(region.longitude),
        radius: Number(region.radius),
        restaurant_count: Number(region.restaurant_count ?? 0),
        dish_count: Number(region.dish_count ?? 0),
      })) as Region[];
      setRegions(normalized);
    } catch (error) {
      console.error(error);
      alert((error as Error).message);
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Location</th>
            <th>Radius</th>
            <th>Status</th>
            <th>Restaurants</th>
            <th>Dishes</th>
            <th>Last refreshed</th>
            <th style={{ width: '200px' }}>
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <button onClick={reloadRegions} disabled={isReloading}>
                  {isReloading ? 'Refreshing…' : 'Reload'}
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {regions.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                No regions tracked yet.
              </td>
            </tr>
          ) : (
            regions.map((region) => (
              <tr key={region.id}>
                <td style={{ fontWeight: 600 }}>
                  {region.name || 'Unnamed region'}
                  {region.keyword ? <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{region.keyword}</div> : null}
                </td>
                <td>
                  {region.latitude.toFixed(4)}, {region.longitude.toFixed(4)}
                </td>
                <td>{region.radius} m</td>
                <td>
                  <span className={statusClass(region.status)}>{region.status}</span>
                </td>
                <td>{region.restaurant_count}</td>
                <td>{region.dish_count}</td>
                <td>
                  <div>{formatTimestamp(region.last_refreshed_at)}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.65 }}>
                    Requested: {formatTimestamp(region.refresh_requested_at)}
                  </div>
                </td>
                <td>
                  <div className="actions" style={{ justifyContent: 'flex-end' }}>
                    <button onClick={() => handleRefresh(region)} disabled={loadingId === region.id}>
                      {loadingId === region.id ? 'Triggering…' : 'Refresh now'}
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
