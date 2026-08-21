'use client';

import { useMemo, useState } from 'react';
// Local version to avoid importing the loader package which has Node.js dependencies
const summarizeMissingFields = (missing: Record<string, any>): string[] => {
  const labels: Record<string, string> = {
    image: 'Image',
    description: 'Description',
    price: 'Price',
    options: 'Option sets',
  };

  return Object.keys(missing)
    .filter((key) => missing[key])
    .map((key) => labels[key] || key);
};

type DishRow = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  source_image_url?: string | null;
  completeness_score: number | null;
  missing_fields: Record<string, any> | null;
  needs_manual_review: boolean;
  is_published: boolean;
  review_status?: string | null;
  updated_at?: string | null;
  restaurant?: { id: string; name: string | null } | null;
};

type VersionRow = {
  id: string;
  dish_id: string;
  version_number: number;
  is_published: boolean;
  completeness_score: number | null;
  missing_fields: Record<string, any> | null;
  created_at?: string;
};

interface MenuReviewTableProps {
  dishes: DishRow[];
  versions: VersionRow[];
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const normalizedMissing = (missing: Record<string, any> | null | undefined) => {
  if (!missing) return [] as string[];
  if (Array.isArray(missing)) return missing as string[];
  return summarizeMissingFields(missing as any);
};

export default function MenuReviewTable({ dishes, versions }: MenuReviewTableProps) {
  const [rows, setRows] = useState<DishRow[]>(dishes);
  const [history, setHistory] = useState<VersionRow[]>(versions);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<DishRow>>>(() =>
    dishes.reduce((acc, dish) => {
      acc[dish.id] = {
        description: dish.description,
        price: dish.price ?? undefined,
        image_url: dish.image_url ?? undefined,
      };
      return acc;
    }, {} as Record<string, Partial<DishRow>>)
  );

  const versionsByDish = useMemo(() => {
    const map: Record<string, VersionRow[]> = {};
    history.forEach((entry) => {
      map[entry.dish_id] = map[entry.dish_id] || [];
      map[entry.dish_id].push(entry);
    });
    return map;
  }, [history]);

  const applyUpdate = (dish: DishRow, versions: VersionRow[]) => {
    setRows((prev) => prev.map((item) => (item.id === dish.id ? dish : item)));
    setHistory((prev) => {
      const filtered = prev.filter((entry) => entry.dish_id !== dish.id);
      const sorted = [...versions].sort((a, b) => b.version_number - a.version_number);
      return [...filtered, ...sorted];
    });
    setDrafts((prev) => ({
      ...prev,
      [dish.id]: {
        description: dish.description ?? undefined,
        price: dish.price ?? undefined,
        image_url: dish.image_url ?? undefined,
      },
    }));
  };

  const handleRequest = async (payload: any) => {
    setLoadingId(payload.dishId);
    try {
      const response = await fetch('/api/dishes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Request failed');
      }

      const body = await response.json();
      applyUpdate(body.dish, body.versions || []);
    } catch (error) {
      console.error(error);
      alert((error as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleSave = async (dish: DishRow) => {
    const draft = drafts[dish.id] || {};
    const parsedPrice =
      draft.price === undefined || draft.price === null || Number.isNaN(Number(draft.price))
        ? null
        : Number(draft.price);
    await handleRequest({
      dishId: dish.id,
      action: 'update',
      updates: {
        description: draft.description,
        price: parsedPrice,
        image_url: draft.image_url ?? null,
      },
    });
  };

  const handlePublish = async (dishId: string) => {
    await handleRequest({ dishId, action: 'publish' });
  };

  const handleRollback = async (dishId: string, versionId: string) => {
    await handleRequest({ dishId, action: 'rollback', versionId });
  };

  const renderMissing = (dish: DishRow) => {
    const missing = normalizedMissing(dish.missing_fields);
    if (missing.length === 0) return <span className="status-pill ready">Complete</span>;
    return (
      <div className="badge-row">
        {missing.map((item) => (
          <span key={`${dish.id}-${item}`} className="status-pill error">
            Missing {item}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Dish</th>
            <th>Restaurant</th>
            <th>Completeness</th>
            <th>Missing</th>
            <th>Review</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((dish) => {
            const draft = drafts[dish.id] || {};
            const versions = versionsByDish[dish.id] || [];
            return (
              <tr key={dish.id}>
                <td style={{ width: '26%' }}>
                  <div style={{ fontWeight: 700 }}>{dish.name}</div>
                  <div className="muted">{dish.description || 'No description yet'}</div>
                  <div className="edit-grid">
                    <label>
                      Description
                      <textarea
                        value={draft.description ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [dish.id]: { ...draft, description: e.target.value } }))
                        }
                      />
                    </label>
                    <label>
                      Price
                      <input
                        type="number"
                        value={draft.price ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [dish.id]: {
                              ...draft,
                              price: e.target.value === '' ? undefined : Number(e.target.value),
                            },
                          }))
                        }
                        placeholder="0.00"
                      />
                    </label>
                    <label>
                      Image URL
                      <input
                        type="text"
                        value={draft.image_url ?? ''}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [dish.id]: { ...draft, image_url: e.target.value } }))
                        }
                        placeholder="https://"
                      />
                    </label>
                  </div>
                </td>
                <td>
                  <div>{dish.restaurant?.name || '—'}</div>
                  <div className="muted">Updated {formatDateTime(dish.updated_at as any)}</div>
                </td>
                <td>
                  <div className="score">
                    {dish.completeness_score !== null ? `${dish.completeness_score.toFixed(0)} / 100` : 'n/a'}
                  </div>
                </td>
                <td>{renderMissing(dish)}</td>
                <td>
                  <div className="badge-row">
                    {dish.needs_manual_review ? (
                      <span className="status-pill error">Needs review</span>
                    ) : (
                      <span className="status-pill ready">Auto-approved</span>
                    )}
                    {dish.is_published ? (
                      <span className="status-pill ready">Live</span>
                    ) : (
                      <span className="status-pill refreshing">Draft</span>
                    )}
                  </div>
                  <div className="version-stack">
                    <strong>Versions</strong>
                    {versions.length === 0 ? (
                      <span className="muted">No history</span>
                    ) : (
                      versions.map((version) => (
                        <div key={version.id} className="version-row">
                          <span>
                            v{version.version_number} · {formatDateTime(version.created_at)}
                          </span>
                          <div className="actions">
                            {!version.is_published && (
                              <button
                                onClick={() => handleRollback(dish.id, version.id)}
                                disabled={loadingId === dish.id}
                              >
                                Restore
                              </button>
                            )}
                            {version.is_published && <span className="status-pill ready">Published</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </td>
                <td>
                  <div className="actions" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                    <button onClick={() => handleSave(dish)} disabled={loadingId === dish.id}>
                      {loadingId === dish.id ? 'Saving…' : 'Save edits'}
                    </button>
                    <button onClick={() => handlePublish(dish.id)} disabled={loadingId === dish.id}>
                      {loadingId === dish.id ? 'Updating…' : 'Publish latest'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
