'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { City, Day, Locality, OpeningHours, OwnerBusiness } from '@/lib/types';
import { CategorySelect } from './category-select';

const DAYS: [Day, string][] = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday'],
];

type Hours = Record<Day, { open: boolean; from: string; to: string }>;

function toHours(h: OpeningHours | null | undefined): Hours {
  return Object.fromEntries(
    DAYS.map(([d]) => {
      const first = h?.[d]?.[0];
      return [d, { open: !!first, from: first?.open ?? '09:00', to: first?.close ?? '21:00' }];
    }),
  ) as Hours;
}

function fromHours(h: Hours): OpeningHours {
  return Object.fromEntries(DAYS.map(([d]) => [d, h[d].open ? [{ open: h[d].from, close: h[d].to }] : []]));
}

/**
 * Register a business (no `business`) or edit one. Fields the API has locked for the owner
 * (`lockedFields`, e.g. while under review) are shown read-only and never sent.
 */
export function BusinessForm({
  business,
  onSaved,
}: {
  business?: OwnerBusiness;
  onSaved: (b: OwnerBusiness) => void;
}) {
  const locked = new Set(business?.lockedFields ?? []);
  const [cities, setCities] = useState<City[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [v, setV] = useState({
    name: business?.name ?? '',
    categoryId: business?.category.id ?? '',
    description: business?.description ?? '',
    phone: business?.contact.phone ?? '',
    whatsapp: business?.contact.whatsapp ?? '',
    email: business?.contact.email ?? '',
    website: business?.contact.website ?? '',
    registrationNumber: business?.registrationNumber ?? '',
    addressLine1: business?.address.line1 ?? '',
    addressLine2: business?.address.line2 ?? '',
    cityId: business?.address.city.id ?? '',
    localityId: business?.address.locality?.id ?? '',
    postalCode: business?.address.postalCode ?? '',
    latitude: business ? String(business.coordinates.latitude) : '',
    longitude: business ? String(business.coordinates.longitude) : '',
  });
  const [withHours, setWithHours] = useState(!!business?.openingHours);
  const [hours, setHours] = useState<Hours>(toHours(business?.openingHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const set = (key: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [key]: e.target.value }));

  useEffect(() => {
    api<City[]>('/cities', { auth: false })
      .then(setCities)
      .catch(() => setCities([]));
  }, []);

  const citySlug = cities.find((c) => c.id === v.cityId)?.slug;
  useEffect(() => {
    if (!citySlug) {
      setLocalities([]);
      return;
    }
    api<Locality[]>(`/cities/${citySlug}/localities`, { auth: false })
      .then(setLocalities)
      .catch(() => setLocalities([]));
  }, [citySlug]);

  function locateShop() {
    if (!('geolocation' in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setV((s) => ({
          ...s,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Enter the coordinates from Google Maps instead.');
      },
      { enableHighAccuracy: true, timeout: 20_000 },
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const orNull = (s: string) => (s.trim() ? s.trim() : null);
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    if (!locked.has('location') && (!v.latitude || !v.longitude || Number.isNaN(lat) || Number.isNaN(lng))) {
      setError('Set the shop location (use "I am at the shop now" or enter the coordinates).');
      setBusy(false);
      return;
    }
    const body: Record<string, unknown> = {
      name: v.name.trim(),
      categoryId: v.categoryId,
      description: orNull(v.description),
      phone: v.phone.trim(),
      whatsapp: orNull(v.whatsapp),
      email: orNull(v.email),
      website: orNull(v.website),
      registrationNumber: orNull(v.registrationNumber),
      openingHours: withHours ? fromHours(hours) : null,
      location: {
        addressLine1: v.addressLine1.trim(),
        addressLine2: orNull(v.addressLine2),
        cityId: v.cityId,
        localityId: v.localityId || null,
        postalCode: orNull(v.postalCode),
        latitude: lat,
        longitude: lng,
      },
    };
    for (const field of locked) delete body[field];
    if (!business) for (const [k, val] of Object.entries(body)) if (val === null) delete body[k];
    try {
      const saved = business
        ? await api<OwnerBusiness>(`/me/businesses/${business.id}`, { method: 'PATCH', body })
        : await api<OwnerBusiness>('/me/businesses', { method: 'POST', body });
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const lockNote = (field: string) =>
    locked.has(field) ? <span className="ml-1 text-xs text-gray-500">(locked during review: ask an admin to change it)</span> : null;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="b-name">
            Business name {lockNote('name')}
          </label>
          <input id="b-name" className="input" required minLength={2} maxLength={120} value={v.name} onChange={set('name')} disabled={locked.has('name')} />
        </div>
        <div>
          <label className="label" htmlFor="b-cat">
            Category
          </label>
          <CategorySelect id="b-cat" value={v.categoryId} onChange={(id) => setV((s) => ({ ...s, categoryId: id }))} />
        </div>
        <div>
          <label className="label" htmlFor="b-phone">
            Shop phone {lockNote('phone')}
          </label>
          <input id="b-phone" className="input" type="tel" required value={v.phone} onChange={set('phone')} disabled={locked.has('phone')} />
        </div>
        <div>
          <label className="label" htmlFor="b-wa">
            WhatsApp (optional)
          </label>
          <input id="b-wa" className="input" type="tel" value={v.whatsapp} onChange={set('whatsapp')} />
        </div>
        <div>
          <label className="label" htmlFor="b-email">
            Email (optional)
          </label>
          <input id="b-email" className="input" type="email" value={v.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="b-web">
            Website (optional)
          </label>
          <input id="b-web" className="input" type="url" placeholder="https://" value={v.website} onChange={set('website')} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="b-reg">
            Shop registration number (optional) {lockNote('registrationNumber')}
          </label>
          <input id="b-reg" className="input" value={v.registrationNumber} onChange={set('registrationNumber')} disabled={locked.has('registrationNumber')} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="b-desc">
            About the business (optional)
          </label>
          <textarea id="b-desc" className="input" rows={3} maxLength={2000} value={v.description} onChange={set('description')} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4" disabled={locked.has('location')}>
        <legend className="px-1 text-sm font-semibold">Address and map location {lockNote('location')}</legend>
        <div>
          <label className="label" htmlFor="b-a1">
            Shop / door number, building, street
          </label>
          <input id="b-a1" className="input" required minLength={3} value={v.addressLine1} onChange={set('addressLine1')} placeholder="Shop 12, Laxmi Complex, Station Road" />
        </div>
        <div>
          <label className="label" htmlFor="b-a2">
            Landmark (optional)
          </label>
          <input id="b-a2" className="input" value={v.addressLine2} onChange={set('addressLine2')} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="b-city">
              City
            </label>
            <select id="b-city" className="input" required value={v.cityId} onChange={(e) => setV((s) => ({ ...s, cityId: e.target.value, localityId: '' }))}>
              <option value="">Choose…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="b-loc">
              Area / locality
            </label>
            <select id="b-loc" className="input" value={v.localityId} onChange={set('localityId')}>
              <option value="">Choose…</option>
              {localities.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="b-pin">
              PIN code
            </label>
            <input id="b-pin" className="input" inputMode="numeric" value={v.postalCode} onChange={set('postalCode')} />
          </div>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="b-lat">
              Latitude
            </label>
            <input id="b-lat" className="input" inputMode="decimal" value={v.latitude} onChange={set('latitude')} placeholder="15.3647" />
          </div>
          <div>
            <label className="label" htmlFor="b-lng">
              Longitude
            </label>
            <input id="b-lng" className="input" inputMode="decimal" value={v.longitude} onChange={set('longitude')} placeholder="75.1240" />
          </div>
          <button type="button" className="btn-secondary" onClick={locateShop} disabled={locating}>
            {locating ? 'Locating…' : '📍 I am at the shop now'}
          </button>
        </div>
        {v.latitude && v.longitude && (
          <a
            className="text-sm text-brand-700 underline"
            href={`https://www.google.com/maps?q=${encodeURIComponent(`${v.latitude},${v.longitude}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Check this location on Google Maps
          </a>
        )}
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold">Opening hours</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withHours} onChange={(e) => setWithHours(e.target.checked)} /> Show opening hours
        </label>
        {withHours &&
          DAYS.map(([d, label]) => (
            <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-32 items-center gap-2">
                <input type="checkbox" checked={hours[d].open} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d], open: e.target.checked } }))} />
                {label}
              </label>
              {hours[d].open ? (
                <>
                  <input type="time" className="input w-auto" value={hours[d].from} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d], from: e.target.value } }))} />
                  <span>to</span>
                  <input type="time" className="input w-auto" value={hours[d].to} onChange={(e) => setHours((h) => ({ ...h, [d]: { ...h[d], to: e.target.value } }))} />
                </>
              ) : (
                <span className="text-gray-500">Closed</span>
              )}
            </div>
          ))}
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : business ? 'Save changes' : 'Register business'}
      </button>
    </form>
  );
}
