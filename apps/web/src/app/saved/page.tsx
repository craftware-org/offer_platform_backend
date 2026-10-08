'use client';

import { useEffect, useState } from 'react';
import { OfferGrid } from '@/components/offer-card';
import { RequireAuth } from '@/components/require-auth';
import { apiPage, errorMessage } from '@/lib/api';
import { useEngagement } from '@/lib/engagement';
import type { PublicOffer } from '@/lib/types';

export default function SavedPage() {
  return (
    <RequireAuth>
      <Saved />
    </RequireAuth>
  );
}

function Saved() {
  const { isSaved } = useEngagement();
  const [tab, setTab] = useState<'active' | 'ended'>('active');
  const [offers, setOffers] = useState<PublicOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOffers(null);
    setError(null);
    apiPage<PublicOffer>('/me/saved-offers', { query: { status: tab, pageSize: 50 } })
      .then((r) => setOffers(r.items))
      .catch((e) => setError(errorMessage(e)));
  }, [tab]);

  // Hide offers un-saved on this page right away (the heart updates the shared state).
  const visible = offers?.filter((o) => tab === 'ended' || isSaved(o.id)) ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Saved offers</h1>
      <div className="flex gap-2">
        <button className={tab === 'active' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('active')}>
          Still on
        </button>
        <button className={tab === 'ended' ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab('ended')}>
          Ended
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!visible && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {visible && (
        <OfferGrid
          offers={visible}
          empty={tab === 'active' ? 'Nothing saved yet. Tap ♡ on an offer to keep it here.' : 'No ended offers.'}
        />
      )}
    </div>
  );
}
