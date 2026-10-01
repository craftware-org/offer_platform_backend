'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { ModerationPanel, type ModerationAction } from '@/components/moderation-panel';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import type { AdminBusiness, BusinessImage } from '@/lib/types';

export default function AdminBusinessPage() {
  return (
    <RequireAuth permission="businesses:read">
      <Review />
    </RequireAuth>
  );
}

function actionsFor(b: AdminBusiness, can: (p: string) => boolean): ModerationAction[] {
  const list: ModerationAction[] = [];
  if (b.status === 'UNDER_REVIEW' && can('businesses:verify')) {
    list.push({ action: 'VERIFY', label: 'Verify', needsReason: false, style: 'btn-primary' });
    list.push({ action: 'REJECT', label: 'Reject', needsReason: true, style: 'btn-danger' });
  }
  if (can('businesses:manage')) {
    if (b.status === 'SUSPENDED') list.push({ action: 'REACTIVATE', label: 'Reactivate', needsReason: false, style: 'btn-primary' });
    else list.push({ action: 'SUSPEND', label: 'Suspend', needsReason: true, style: 'btn-secondary' });
  }
  return list;
}

function Review() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [b, setB] = useState<AdminBusiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AdminBusiness>(`/admin/businesses/${id}`)
      .then(setB)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!b) return <p className="text-sm text-gray-500">Loading…</p>;

  const photos = (title: string, list: BusinessImage[]) => (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">None</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {list.map((img) => (
            <AuthImage key={img.id} path={img.urls.full} alt={title} className="max-h-72 rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-sm text-gray-600 underline">
        ← Admin
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{b.name}</h1>
        <StatusBadge status={b.status} />
      </div>
      {b.statusReason && <p className="text-sm text-gray-700">Last reason: {b.statusReason}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">Details to check</h2>
          <dl className="grid grid-cols-3 gap-1">
            <dt className="text-gray-500">Category</dt>
            <dd className="col-span-2">{b.category.name}</dd>
            <dt className="text-gray-500">Phone</dt>
            <dd className="col-span-2">
              <a className="underline" href={`tel:${b.contact.phone}`}>
                {b.contact.phone}
              </a>
            </dd>
            <dt className="text-gray-500">WhatsApp</dt>
            <dd className="col-span-2">{b.contact.whatsapp ?? '—'}</dd>
            <dt className="text-gray-500">Registration no.</dt>
            <dd className="col-span-2">{b.registrationNumber ?? '—'}</dd>
            <dt className="text-gray-500">Address</dt>
            <dd className="col-span-2">
              {b.address.line1}
              {b.address.line2 && `, ${b.address.line2}`}
              {b.address.locality && `, ${b.address.locality.name}`}, {b.address.city.name} {b.address.postalCode}
            </dd>
            <dt className="text-gray-500">Map</dt>
            <dd className="col-span-2">
              <a
                className="text-brand-700 underline"
                href={`https://www.google.com/maps?q=${b.coordinates.latitude},${b.coordinates.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open pin in Google Maps
              </a>
            </dd>
            <dt className="text-gray-500">Submitted</dt>
            <dd className="col-span-2">{b.submittedAt ? formatDateTime(b.submittedAt) : '—'}</dd>
          </dl>
          {b.description && <p className="pt-2 whitespace-pre-line text-gray-700">{b.description}</p>}
          <ul className="pt-2">
            {b.verification.items.map((i) => (
              <li key={i.key}>
                {i.done ? '✅' : '⬜'} {i.label} {i.required ? '' : '(optional)'}
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-4">
          <h2 className="font-semibold">Verification photos (private)</h2>
          {photos('Shop', b.verificationPhotos.shop)}
          {photos('Owner', b.verificationPhotos.owner)}
        </section>
      </div>

      <ModerationPanel<AdminBusiness> path={`/admin/businesses/${b.id}/status`} actions={actionsFor(b, can)} onDone={setB} />
    </div>
  );
}
