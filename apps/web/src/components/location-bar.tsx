'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { useCustomerLocation } from '@/lib/location';
import type { City } from '@/lib/types';

type LocationState = ReturnType<typeof useCustomerLocation>;

export function LocationBar({ state, radiusOptions }: { state: LocationState; radiusOptions: number[] }) {
  const [cities, setCities] = useState<City[]>([]);
  useEffect(() => {
    api<City[]>('/cities', { auth: false })
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const { location } = state;
  return (
    <div className="card flex flex-wrap items-center gap-3 text-sm">
      <span className="text-gray-600">
        {location?.kind === 'gps'
          ? 'Showing offers near you'
          : location?.kind === 'city'
            ? `Showing offers in ${location.name}`
            : 'Choose where to look'}
      </span>
      <button type="button" className="btn-secondary py-1.5" onClick={state.locateMe} disabled={state.locating}>
        {state.locating ? 'Locating…' : '📍 Use my location'}
      </button>
      <select
        aria-label="City"
        className="input w-auto py-1.5"
        value={location?.kind === 'city' ? location.slug : ''}
        onChange={(e) => {
          const city = cities.find((c) => c.slug === e.target.value);
          state.setLocation(city ? { kind: 'city', slug: city.slug, name: city.name } : null);
        }}
      >
        <option value="">Choose city…</option>
        {cities.map((c) => (
          <option key={c.id} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      {location?.kind === 'gps' && (
        <label className="flex items-center gap-2">
          <span className="text-gray-600">Within</span>
          <select
            className="input w-auto py-1.5"
            value={state.radiusKm}
            onChange={(e) => state.setRadius(Number(e.target.value))}
          >
            {radiusOptions.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>
      )}
      {state.error && <p className="w-full text-red-600">{state.error}</p>}
    </div>
  );
}
