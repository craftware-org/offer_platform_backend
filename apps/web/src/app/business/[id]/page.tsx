'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { BusinessForm } from '@/components/business-form';
import { ImageUpload } from '@/components/image-upload';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, apiPage, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { BusinessDashboard, BusinessImage, OwnerBusiness, OwnerOffer } from '@/lib/types';

export default function BusinessDashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<OwnerBusiness | null>(null);
  const [dash, setDash] = useState<BusinessDashboard | null>(null);
  const [offers, setOffers] = useState<OwnerOffer[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, d, o] = await Promise.all([
        api<OwnerBusiness>(`/me/businesses/${id}`),
        api<BusinessDashboard>(`/me/businesses/${id}/dashboard`),
        apiPage<OwnerOffer>(`/me/businesses/${id}/offers`, { query: { pageSize: 50 } }),
      ]);
      setBusiness(b);
      setDash(d);
      setOffers(o.items);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitForVerification() {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/businesses/${id}/submit`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await api(`/me/businesses/${id}/images/${imageId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error && !business) return <p className="text-sm text-red-600">{error}</p>;
  if (!business || !dash) return <p className="text-sm text-gray-500">Loading…</p>;

  const canChangeVerificationPhotos = business.status === 'PENDING' || business.status === 'REJECTED';
  const photos = (list: BusinessImage[], canDelete: boolean) => (
    <div className="flex flex-wrap gap-2">
      {list.map((img) => (
        <div key={img.id} className="relative">
          <AuthImage path={img.urls.thumb} alt="" className="h-24 w-24 rounded-lg object-cover" />
          {canDelete && (
            <button
              type="button"
              className="absolute top-1 right-1 rounded-full bg-white/90 px-1.5 text-xs text-red-700 shadow"
              onClick={() => void removeImage(img.id)}
              aria-label="Delete photo"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{business.name}</h1>
        <StatusBadge status={business.status} />
        {dash.business.publicPath && (
          <Link href={dash.business.publicPath} className="text-sm text-brand-700 underline">
            View public page
          </Link>
        )}
        <button className="btn-secondary ml-auto" onClick={() => setEditing((e) => !e)}>
          {editing ? 'Close editing' : 'Edit details'}
        </button>
      </div>

      {business.statusReason && (business.status === 'REJECTED' || business.status === 'SUSPENDED') && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Admin note: {business.statusReason}</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {editing && (
        <section className="card">
          <BusinessForm
            business={business}
            onSaved={(b) => {
              setBusiness(b);
              setEditing(false);
              void load();
            }}
          />
        </section>
      )}

      {business.status !== 'VERIFIED' && (
        <section className="card space-y-4">
          <h2 className="font-semibold">Verification</h2>
          {business.status === 'UNDER_REVIEW' ? (
            <p className="text-sm text-gray-700">
              Submitted {business.submittedAt && formatDateTime(business.submittedAt)}. An admin will check the details
              and photos. You can publish offers once the business is verified.
            </p>
          ) : (
            <p className="text-sm text-gray-700">
              We do not ask for identity documents. Add a clear photo of your shop front (with the signboard if you have
              one). These photos are seen only by you and our admins.
            </p>
          )}
          <ul className="space-y-1 text-sm">
            {dash.verification.items.map((item) => (
              <li key={item.key}>
                {item.done ? '✅' : item.required ? '⬜' : '◻️'} {item.label}
                {!item.required && <span className="text-gray-500"> (optional)</span>}
              </li>
            ))}
          </ul>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Shop photos</h3>
              {photos(business.verificationPhotos.shop, canChangeVerificationPhotos)}
              {canChangeVerificationPhotos && (
                <ImageUpload path={`/me/businesses/${id}/images?kind=VERIFICATION_SHOP`} label="Add shop photo" onUploaded={load} />
              )}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Owner photo (optional)</h3>
              {photos(business.verificationPhotos.owner, canChangeVerificationPhotos)}
              {canChangeVerificationPhotos && (
                <ImageUpload path={`/me/businesses/${id}/images?kind=VERIFICATION_OWNER`} label="Add owner photo" onUploaded={load} />
              )}
            </div>
          </div>
          {canChangeVerificationPhotos && (
            <button className="btn-primary" disabled={!dash.canSubmit || busy} onClick={() => void submitForVerification()}>
              {busy ? 'Submitting…' : 'Submit for verification'}
            </button>
          )}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Logo and photos (shown publicly once verified)</h2>
        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Logo</h3>
            {business.logo && photos([business.logo], true)}
            <ImageUpload path={`/me/businesses/${id}/images?kind=LOGO`} label={business.logo ? 'Replace logo' : 'Add logo'} onUploaded={load} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Gallery</h3>
            {photos(business.gallery, true)}
            <ImageUpload path={`/me/businesses/${id}/images?kind=GALLERY`} label="Add photo" onUploaded={load} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Offers</h2>
          {business.status === 'VERIFIED' ? (
            <Link href={`/business/${id}/offers/new`} className="btn-primary">
              New offer
            </Link>
          ) : (
            <span className="text-sm text-gray-500">You can create offers after verification.</span>
          )}
        </div>
        {offers.length === 0 ? (
          <p className="text-sm text-gray-500">No offers yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {offers.map((o) => (
              <Link key={o.id} href={`/business/offers/${o.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-gray-50">
                <span className="font-medium">{o.title}</span>
                {o.headline && <span className="text-sm text-brand-700">{o.headline}</span>}
                <span className="ml-auto text-xs text-gray-500">until {formatDateTime(o.expiresAt)}</span>
                <StatusBadge status={o.status} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
