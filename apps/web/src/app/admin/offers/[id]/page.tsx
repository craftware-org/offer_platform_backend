'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { ModerationPanel, type ModerationAction } from '@/components/moderation-panel';
import { OfferPrice } from '@/components/offer-price';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import type { AdminOffer } from '@/lib/types';

export default function AdminOfferPage() {
  return (
    <RequireAuth permission="offers:read">
      <Review />
    </RequireAuth>
  );
}

function actionsFor(o: AdminOffer, can: (p: string) => boolean): ModerationAction[] {
  if (!can('offers:moderate')) return [];
  const list: ModerationAction[] = [];
  if (o.status === 'PENDING_REVIEW') {
    list.push({ action: 'APPROVE', label: 'Approve', needsReason: false, style: 'btn-primary' });
    list.push({ action: 'REQUEST_CHANGES', label: 'Request changes', needsReason: true, style: 'btn-secondary' });
    list.push({ action: 'REJECT', label: 'Reject', needsReason: true, style: 'btn-danger' });
  }
  if (['PENDING_REVIEW', 'SCHEDULED', 'ACTIVE', 'PAUSED'].includes(o.status))
    list.push({ action: 'SUSPEND', label: 'Suspend', needsReason: true, style: 'btn-secondary' });
  if (o.status === 'SUSPENDED') list.push({ action: 'REACTIVATE', label: 'Reactivate', needsReason: false, style: 'btn-primary' });
  return list;
}

function Review() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [o, setO] = useState<AdminOffer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminOffer>(`/admin/offers/${id}`)
      .then(setO)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!o) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{o.title}</h1>
        <StatusBadge status={o.status} />
        {o.headline && <span className="text-brand-700">{o.headline}</span>}
      </div>
      {o.statusReason && <p className="text-sm text-gray-700">Last reason: {o.statusReason}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Business:</span> {o.business.name}{' '}
            <span className="text-gray-500">({o.businessStatus.toLowerCase()})</span>
          </p>
          <p>
            <span className="text-gray-500">Type:</span> {o.type.replaceAll('_', ' ').toLowerCase()} ·{' '}
            <span className="text-gray-500">Category:</span> {o.category.name}
          </p>
          <OfferPrice type={o.type} pricing={o.pricing} />
          {o.pricing.discountPercent !== null && (
            <p>
              <span className="text-gray-500">Discount:</span> {o.pricing.discountPercent}%
            </p>
          )}
          <p>
            <span className="text-gray-500">Runs:</span> {formatDateTime(o.startsAt)} – {formatDateTime(o.expiresAt)}
          </p>
          {o.quantityLimit !== null && <p>Limited to {o.quantityLimit} customers</p>}
          {o.description && <p className="whitespace-pre-line text-gray-700">{o.description}</p>}
          {o.eligibility && <p className="text-gray-700">Who: {o.eligibility}</p>}
          {o.terms && <p className="text-gray-700">Terms: {o.terms}</p>}
        </section>
        <section className="card space-y-2">
          <h2 className="font-semibold">Photos</h2>
          {o.images.length === 0 ? (
            <p className="text-sm text-gray-500">None</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {o.images.map((img) => (
                <AuthImage key={img.id} path={img.urls.full} alt="" className="max-h-72 rounded-lg" />
              ))}
            </div>
          )}
        </section>
      </div>

      <ModerationPanel<AdminOffer> path={`/admin/offers/${o.id}/status`} actions={actionsFor(o, can)} onDone={setO} />
    </div>
  );
}
