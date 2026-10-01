'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { apiPage, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import type { AdminBusiness, AdminOffer } from '@/lib/types';

const BUSINESS_STATUSES = ['UNDER_REVIEW', 'PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
const OFFER_STATUSES = ['PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'DRAFT', 'REJECTED', 'EXPIRED', 'SUSPENDED'];

export default function AdminPage() {
  return (
    <RequireAuth>
      <Admin />
    </RequireAuth>
  );
}

function Admin() {
  const { can } = useAuth();
  const tabs = [
    can('businesses:read') && ('businesses' as const),
    can('offers:read') && ('offers' as const),
  ].filter(Boolean) as ('businesses' | 'offers')[];
  const [tab, setTab] = useState<'businesses' | 'offers'>(tabs[0] ?? 'businesses');

  if (tabs.length === 0) return <p className="card text-sm text-gray-600">You don&apos;t have admin access.</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Review queues</h1>
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button key={t} className={tab === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(t)}>
            {t === 'businesses' ? 'Businesses' : 'Offers'}
          </button>
        ))}
      </div>
      {tab === 'businesses' ? <BusinessQueue /> : <OfferQueue />}
    </div>
  );
}

function useList<T>(path: string, status: string, search: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError(null);
    apiPage<T>(path, { query: { status, search: search.trim() || undefined, pageSize: 50 }, signal: controller.signal })
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [path, status, search]);
  return { items, error };
}

function Filters({
  statuses,
  status,
  setStatus,
  search,
  setSearch,
}: {
  statuses: string[];
  status: string;
  setStatus: (s: string) => void;
  search: string;
  setSearch: (s: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
        {statuses.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll('_', ' ').toLowerCase()}
          </option>
        ))}
        <option value="">all</option>
      </select>
      <input className="input w-64" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
    </div>
  );
}

function BusinessQueue() {
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [search, setSearch] = useState('');
  const { items, error } = useList<AdminBusiness>('/admin/businesses', status, search);
  return (
    <div className="space-y-3">
      <Filters statuses={BUSINESS_STATUSES} status={status} setStatus={setStatus} search={search} setSearch={setSearch} />
      {status === 'UNDER_REVIEW' && <p className="text-sm text-gray-600">Oldest submissions first.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items?.length === 0 && <p className="text-sm text-gray-500">Nothing here.</p>}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {items?.map((b) => (
          <Link key={b.id} href={`/admin/businesses/${b.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-gray-50">
            <span className="font-medium">{b.name}</span>
            <span className="text-sm text-gray-600">
              {b.category.name} · {b.address.locality?.name ?? b.address.city.name}
            </span>
            <span className="ml-auto text-xs text-gray-500">
              {b.submittedAt ? `submitted ${formatDateTime(b.submittedAt)}` : `created ${formatDateTime(b.createdAt)}`}
            </span>
            <StatusBadge status={b.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function OfferQueue() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [search, setSearch] = useState('');
  const { items, error } = useList<AdminOffer>('/admin/offers', status, search);
  return (
    <div className="space-y-3">
      <Filters statuses={OFFER_STATUSES} status={status} setStatus={setStatus} search={search} setSearch={setSearch} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items?.length === 0 && <p className="text-sm text-gray-500">Nothing here.</p>}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {items?.map((o) => (
          <Link key={o.id} href={`/admin/offers/${o.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-gray-50">
            <span className="font-medium">{o.title}</span>
            {o.headline && <span className="text-sm text-brand-700">{o.headline}</span>}
            <span className="text-sm text-gray-600">{o.business.name}</span>
            <span className="ml-auto text-xs text-gray-500">
              {o.submittedAt ? `submitted ${formatDateTime(o.submittedAt)}` : ''}
            </span>
            <StatusBadge status={o.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
