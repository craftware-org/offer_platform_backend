'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';
import type { GeoPoint } from '@/lib/types';

interface AdminCity {
  id: string;
  name: string;
  slug: string;
  state: string;
  center: GeoPoint;
  serviceRadiusKm: number;
  isActive: boolean;
}
interface AdminLocality {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export default function AdminLocationsPage() {
  return (
    <RequireAuth permission="locations:manage">
      <Locations />
    </RequireAuth>
  );
}

function Locations() {
  const [cities, setCities] = useState<AdminCity[] | null>(null);
  const [cityId, setCityId] = useState<string>('');
  const [localities, setLocalities] = useState<AdminLocality[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCities = useCallback(async () => {
    try {
      const list = await api<AdminCity[]>('/admin/cities');
      setCities(list);
      setCityId((current) => current || list[0]?.id || '');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  const loadLocalities = useCallback(async () => {
    if (!cityId) return;
    try {
      setLocalities(await api<AdminLocality[]>(`/admin/cities/${cityId}/localities`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cityId]);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);
  useEffect(() => {
    void loadLocalities();
  }, [loadLocalities]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadCities();
      await loadLocalities();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const city = cities?.find((c) => c.id === cityId);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Cities & areas</h1>
      <p className="text-sm text-gray-600">
        Areas appear in the business registration form and in search (“fashion in Vidya Nagar”). Hidden ones disappear from
        both; businesses already in them keep their address. Nothing is ever deleted.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="card space-y-2">
        <h2 className="font-semibold">Cities</h2>
        {cities?.map((c) => (
          <NameRow
            key={c.id}
            name={c.name}
            detail={`${c.state} · /${c.slug}`}
            active={c.isActive}
            selected={c.id === cityId}
            busy={busy}
            onSelect={() => setCityId(c.id)}
            onSave={(patch) => run(() => api(`/admin/cities/${c.id}`, { method: 'PATCH', body: patch }))}
          />
        ))}
        <AddCity busy={busy} onAdd={(body) => run(() => api('/admin/cities', { method: 'POST', body }))} />
      </section>

      {city && (
        <section className="card space-y-2">
          <h2 className="font-semibold">Areas in {city.name}</h2>
          {localities?.length === 0 && <p className="text-sm text-gray-500">No areas yet.</p>}
          {localities?.map((l) => (
            <NameRow
              key={l.id}
              name={l.name}
              detail={`/${l.slug}`}
              active={l.isActive}
              busy={busy}
              onSave={(patch) => run(() => api(`/admin/localities/${l.id}`, { method: 'PATCH', body: patch }))}
            />
          ))}
          <AddArea busy={busy} onAdd={(name) => run(() => api(`/admin/cities/${city.id}/localities`, { method: 'POST', body: { name } }))} />
        </section>
      )}
    </div>
  );
}

function NameRow({
  name,
  detail,
  active,
  selected,
  busy,
  onSelect,
  onSave,
}: {
  name: string;
  detail: string;
  active: boolean;
  selected?: boolean;
  busy: boolean;
  onSelect?: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  if (editing) {
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ name: value.trim() }).then(() => setEditing(false));
        }}
      >
        <input className="input" aria-label="Name" minLength={2} maxLength={100} required value={value} onChange={(e) => setValue(e.target.value)} />
        <button className="btn-primary py-1.5" disabled={busy}>
          Save
        </button>
        <button type="button" className="btn-secondary py-1.5" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </form>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-lg px-2 py-1 text-sm ${selected ? 'bg-brand-50' : ''}`}>
      {onSelect ? (
        <button type="button" className={`flex-1 text-left font-medium ${active ? '' : 'text-gray-400 line-through'}`} onClick={onSelect}>
          {name} <span className="text-xs font-normal text-gray-500">{detail}</span>
        </button>
      ) : (
        <span className={`flex-1 ${active ? '' : 'text-gray-400 line-through'}`}>
          {name} <span className="text-xs text-gray-400">{detail}</span>
        </span>
      )}
      {!active && <span className="badge bg-gray-100 text-gray-600">hidden</span>}
      <button className="btn-secondary py-1" disabled={busy} onClick={() => setEditing(true)}>
        Rename
      </button>
      <button className="btn-secondary py-1" disabled={busy} onClick={() => void onSave({ isActive: !active })}>
        {active ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function AddArea({ busy, onAdd }: { busy: boolean; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="flex gap-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd(name.trim()).then(() => setName(''));
      }}
    >
      <input className="input" placeholder="New area name, e.g. Keshwapur" aria-label="New area name" minLength={2} maxLength={100} required value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn-secondary whitespace-nowrap" disabled={busy || name.trim().length < 2}>
        Add area
      </button>
    </form>
  );
}

function AddCity({ busy, onAdd }: { busy: boolean; onAdd: (body: Record<string, unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: '', state: 'Karnataka', latitude: '', longitude: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  if (!open) {
    return (
      <button className="btn-secondary mt-1" onClick={() => setOpen(true)}>
        Add a city (new market)
      </button>
    );
  }
  return (
    <form
      className="grid gap-2 pt-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onAdd({
          name: v.name.trim(),
          state: v.state.trim(),
          center: { latitude: Number(v.latitude), longitude: Number(v.longitude) },
        }).then(() => setOpen(false));
      }}
    >
      <input className="input" placeholder="City name" aria-label="City name" required minLength={2} value={v.name} onChange={set('name')} />
      <input className="input" placeholder="State" aria-label="State" required minLength={2} value={v.state} onChange={set('state')} />
      <input className="input" placeholder="Centre latitude, e.g. 15.3647" aria-label="Centre latitude" required inputMode="decimal" value={v.latitude} onChange={set('latitude')} />
      <input className="input" placeholder="Centre longitude, e.g. 75.1240" aria-label="Centre longitude" required inputMode="decimal" value={v.longitude} onChange={set('longitude')} />
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>
          Add city
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
