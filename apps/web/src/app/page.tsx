'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LocationBar } from '@/components/location-bar';
import { OfferGrid } from '@/components/offer-card';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCustomerLocation } from '@/lib/location';
import type { HomeSections } from '@/lib/types';

export default function HomePage() {
  const { meta, user } = useAuth();
  const [followed, setFollowed] = useState<HomeSections['nearby']>([]);

  // "From shops you follow" (spec §6 homepage): only for logged-in users who follow someone.
  useEffect(() => {
    if (!user) {
      setFollowed([]);
      return;
    }
    apiPage<HomeSections['nearby'][number]>('/me/feed/following', { query: { pageSize: 8 } })
      .then((r) => setFollowed(r.items))
      .catch(() => setFollowed([]));
  }, [user]);
  const router = useRouter();
  const loc = useCustomerLocation(meta.discovery.defaultRadiusKm);
  const [sections, setSections] = useState<HomeSections | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const queryKey = JSON.stringify(loc.query);

  useEffect(() => {
    if (!loc.ready) return;
    const controller = new AbortController();
    setError(null);
    api<HomeSections>('/discover/home', { auth: false, query: JSON.parse(queryKey), signal: controller.signal })
      .then(setSections)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [loc.ready, queryKey]);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Offers from shops near you</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <input
            className="input"
            placeholder='Try "shoes under 2000", "50% off", "biryani near me"'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search offers"
          />
          <button className="btn-primary" type="submit">
            Search
          </button>
        </form>
        <LocationBar state={loc} radiusOptions={meta.discovery.radiusOptionsKm} />
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!sections && !error && <p className="text-sm text-gray-500">Loading offers…</p>}
      {sections && (
        <>
          {loc.location?.kind === 'gps' && (
            <Section title="Near you" offers={sections.nearby} empty="No offers within this distance yet. Try a larger radius." />
          )}
          {followed.length > 0 && <Section title="From shops you follow" offers={followed} />}
          <Section title="Recommended" offers={sections.recommended} />
          <Section title="New offers" offers={sections.newOffers} />
          <Section title="Ending soon" offers={sections.endingSoon} />
        </>
      )}
    </div>
  );
}

function Section({ title, offers, empty }: { title: string; offers: HomeSections['nearby']; empty?: string }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <OfferGrid offers={offers} empty={empty} />
    </section>
  );
}
