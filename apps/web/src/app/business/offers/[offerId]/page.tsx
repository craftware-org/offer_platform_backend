'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthImage } from '@/components/auth-image';
import { ImageUpload } from '@/components/image-upload';
import { OfferForm } from '@/components/offer-form';
import { OfferPrice } from '@/components/offer-price';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { OwnerOffer } from '@/lib/types';

const ACTION_LABELS: Record<string, { label: string; confirm?: string; style: string }> = {
  SUBMIT: { label: 'Submit for review', style: 'btn-primary' },
  WITHDRAW: { label: 'Withdraw from review', style: 'btn-secondary' },
  PAUSE: { label: 'Pause', style: 'btn-secondary' },
  RESUME: { label: 'Resume', style: 'btn-primary' },
  END: { label: 'End offer now', style: 'btn-danger', confirm: 'End this offer now? This cannot be undone.' },
};

export default function ManageOfferPage() {
  return (
    <RequireAuth>
      <ManageOffer />
    </RequireAuth>
  );
}

function ManageOffer() {
  const { offerId } = useParams<{ offerId: string }>();
  const router = useRouter();
  const [offer, setOffer] = useState<OwnerOffer | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOffer(await api<OwnerOffer>(`/me/offers/${offerId}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [offerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: string) {
    const meta = ACTION_LABELS[action];
    if (meta?.confirm && !window.confirm(meta.confirm)) return;
    setBusy(true);
    setError(null);
    try {
      setOffer(await api<OwnerOffer>(`/me/offers/${offerId}/${action.toLowerCase()}`, { method: 'POST' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!window.confirm('Delete this draft?')) return;
    try {
      await api(`/me/offers/${offerId}`, { method: 'DELETE' });
      router.push(offer ? `/business/${offer.business.id}` : '/business');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeImage(imageId: string) {
    if (!window.confirm('Delete this photo?')) return;
    try {
      await api(`/me/offers/${offerId}/images/${imageId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error && !offer) return <p className="text-sm text-red-600">{error}</p>;
  if (!offer) return <p className="text-sm text-gray-500">Loading…</p>;

  const canEdit = offer.allowedActions.includes('EDIT');
  const neverSubmitted = offer.status === 'DRAFT' && !offer.submittedAt;

  return (
    <div className="space-y-6">
      <Link href={`/business/${offer.business.id}`} className="text-sm text-gray-600 underline">
        ← {offer.business.name}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{offer.title}</h1>
        <StatusBadge status={offer.status} />
        {offer.headline && <span className="text-brand-700">{offer.headline}</span>}
      </div>

      {offer.statusReason && ['DRAFT', 'REJECTED', 'SUSPENDED'].includes(offer.status) && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">Admin note: {offer.statusReason}</p>
      )}
      {offer.status === 'PENDING_REVIEW' && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Waiting for admin review.</p>
      )}
      {['ACTIVE', 'PAUSED', 'EXPIRED'].includes(offer.status) && (
        <Link href={`/offers/${offer.slug}`} className="text-sm text-brand-700 underline">
          View public page
        </Link>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {offer.allowedActions
          .filter((a) => a in ACTION_LABELS)
          .map((a) => (
            <button key={a} className={ACTION_LABELS[a].style} disabled={busy} onClick={() => void act(a)}>
              {ACTION_LABELS[a].label}
            </button>
          ))}
        {canEdit && (
          <button className="btn-secondary" onClick={() => setEditing((e) => !e)}>
            {editing ? 'Close editing' : 'Edit'}
          </button>
        )}
        {neverSubmitted && (
          <button className="btn-secondary text-red-700" onClick={() => void removeDraft()}>
            Delete draft
          </button>
        )}
      </div>

      {editing ? (
        <section className="card">
          <OfferForm
            offer={offer}
            onSaved={(o) => {
              setOffer(o);
              setEditing(false);
            }}
          />
        </section>
      ) : (
        <section className="card space-y-2 text-sm">
          <OfferPrice type={offer.type} pricing={offer.pricing} />
          <p>
            {formatDateTime(offer.startsAt)} – {formatDateTime(offer.expiresAt)}
          </p>
          {offer.description && <p className="whitespace-pre-line text-gray-700">{offer.description}</p>}
          {offer.terms && <p className="text-gray-600">Terms: {offer.terms}</p>}
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Photos</h2>
        <div className="flex flex-wrap gap-2">
          {offer.images.map((img) => (
            <div key={img.id} className="relative">
              <AuthImage path={img.urls.thumb} alt="" className="h-28 w-28 rounded-lg object-cover" />
              {canEdit && (
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
        {canEdit && <ImageUpload path={`/me/offers/${offerId}/images`} label="Add photo" onUploaded={load} />}
      </section>
    </div>
  );
}
