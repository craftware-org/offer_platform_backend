'use client';

import { useCallback, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';

interface Setting<T> {
  key: string;
  description: string;
  value: T;
  defaultValue: T;
}
interface Verification {
  requireShopPhoto: boolean;
  requireOwnerPhoto: boolean;
  requireRegistrationNumber: boolean;
}
interface OfferLimits {
  maxDurationDays: number;
  maxImages: number;
}

export default function AdminSettingsPage() {
  return (
    <RequireAuth permission="settings:manage">
      <Settings />
    </RequireAuth>
  );
}

function Settings() {
  const [settings, setSettings] = useState<Setting<unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await api<Setting<unknown>[]>('/admin/settings'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const verification = settings?.find((s) => s.key === 'business.verification') as Setting<Verification> | undefined;
  const limits = settings?.find((s) => s.key === 'offers.limits') as Setting<OfferLimits> | undefined;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Platform settings</h1>
      <p className="text-sm text-gray-600">Changes apply immediately to everyone and are recorded in the activity log.</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {verification && <VerificationForm setting={verification} onSaved={load} />}
      {limits && <LimitsForm setting={limits} onSaved={load} />}
    </div>
  );
}

function useSave(key: string, onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save(value: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value } });
      await onSaved();
      setMessage('Saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, error, save };
}

function VerificationForm({ setting, onSaved }: { setting: Setting<Verification>; onSaved: () => Promise<void> }) {
  const [v, setV] = useState(setting.value);
  const { busy, message, error, save } = useSave(setting.key, onSaved);
  const items: [keyof Verification, string][] = [
    ['requireShopPhoto', 'Photo of the shop front'],
    ['requireOwnerPhoto', "Owner's photo"],
    ['requireRegistrationNumber', 'Shop registration number'],
  ];
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save(v);
      }}
    >
      <h2 className="font-semibold">Business verification</h2>
      <p className="text-sm text-gray-600">What a business must provide before it can submit for verification.</p>
      {items.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v[key]} onChange={(e) => setV((s) => ({ ...s, [key]: e.target.checked }))} />
          {label} is required
          {setting.defaultValue[key] !== v[key] && <span className="text-xs text-gray-500">(default: {setting.defaultValue[key] ? 'required' : 'optional'})</span>}
        </label>
      ))}
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function LimitsForm({ setting, onSaved }: { setting: Setting<OfferLimits>; onSaved: () => Promise<void> }) {
  const [days, setDays] = useState(String(setting.value.maxDurationDays));
  const [images, setImages] = useState(String(setting.value.maxImages));
  const { busy, message, error, save } = useSave(setting.key, onSaved);
  return (
    <form
      className="card space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save({ maxDurationDays: Number(days), maxImages: Number(images) });
      }}
    >
      <h2 className="font-semibold">Offer limits</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="max-days">
            Longest an offer can run (days)
          </label>
          <input id="max-days" className="input" type="number" min={1} max={365} required value={days} onChange={(e) => setDays(e.target.value)} />
          <p className="mt-1 text-xs text-gray-500">1–365. Default {setting.defaultValue.maxDurationDays}.</p>
        </div>
        <div>
          <label className="label" htmlFor="max-images">
            Photos per offer
          </label>
          <input id="max-images" className="input" type="number" min={0} max={20} required value={images} onChange={(e) => setImages(e.target.value)} />
          <p className="mt-1 text-xs text-gray-500">0–20. Default {setting.defaultValue.maxImages}.</p>
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
