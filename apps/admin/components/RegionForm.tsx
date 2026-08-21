'use client';

import { useState, useTransition } from 'react';
import { z } from 'zod';

const regionSchema = z.object({
  name: z.string().optional(),
  latitude: z.coerce.number().refine((value) => Math.abs(value) <= 90, 'Latitude must be between -90 and 90'),
  longitude: z.coerce.number().refine((value) => Math.abs(value) <= 180, 'Longitude must be between -180 and 180'),
  radius: z.coerce.number().min(100).max(50000),
  keyword: z.string().optional(),
});

export default function RegionForm() {
  const [formState, setFormState] = useState({
    name: '',
    latitude: '',
    longitude: '',
    radius: '3500',
    keyword: '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      try {
        const payload = regionSchema.parse(formState);
        const response = await fetch('/api/regions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to create region');
        }

        setMessage('Region saved and refresh queued.');
      } catch (error) {
        console.error(error);
        setMessage((error as Error).message);
      }
    });
  };

  return (
    <div className="form-card">
      <form onSubmit={handleSubmit} className="form-grid">
        <label>
          Name
          <input
            type="text"
            name="name"
            placeholder="e.g. Mission District"
            value={formState.name}
            onChange={handleChange}
          />
        </label>
        <label>
          Latitude
          <input
            type="text"
            name="latitude"
            placeholder="37.761"
            value={formState.latitude}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Longitude
          <input
            type="text"
            name="longitude"
            placeholder="-122.424"
            value={formState.longitude}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Radius (meters)
          <input
            type="number"
            name="radius"
            min={100}
            max={50000}
            step={100}
            value={formState.radius}
            onChange={handleChange}
            required
          />
        </label>
        <label>
          Keyword (optional)
          <input
            type="text"
            name="keyword"
            placeholder="pizza, sushi, tacos"
            value={formState.keyword}
            onChange={handleChange}
          />
        </label>
        <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
          {message ? <span style={{ alignSelf: 'center', opacity: 0.8 }}>{message}</span> : null}
          <button type="reset" onClick={() => setFormState({ name: '', latitude: '', longitude: '', radius: '3500', keyword: '' })}>
            Reset
          </button>
          <button type="submit" className="primary" disabled={isPending}>
            {isPending ? 'Saving…' : 'Save & refresh'}
          </button>
        </div>
      </form>
    </div>
  );
}
