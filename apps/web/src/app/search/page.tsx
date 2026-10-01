'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { LocationBar } from '@/components/location-bar';
import { OfferGrid } from '@/components/offer-card';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCustomerLocation } from '@/lib/location';
import { formatInr } from '@/lib/money';
import type { CategoryNode, DiscoveredOffer, Interpretation, PageMeta } from '@/lib/types';

const SORTS = [
  ['', 'Best match'],
  ['nearest', 'Nearest'],
  ['newest', 'Newest'],
  ['ending_soon', 'Ending soon'],
  ['discount', 'Biggest discount'],
] as const;

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <Search />
    </Suspense>
  );
}

function Search() {
  const { meta } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const loc = useCustomerLocation(meta.discovery.defaultRadiusKm);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [result, setResult] = useState<{ items: DiscoveredOffer[]; meta: PageMeta & { interpretation: Interpretation } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(params.get('q') ?? '');

  const filters = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    maxPriceRupees: params.get('maxPriceRupees') ?? '',
    minDiscount: params.get('minDiscount') ?? '',
    sort: params.get('sort') ?? '',
    page: params.get('page') ?? '1',
  };
  const key = JSON.stringify({ ...filters, ...loc.query });

  useEffect(() => {
    api<CategoryNode[]>('/categories', { auth: false })
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!loc.ready) return;
    const controller = new AbortController();
    setError(null);
    apiPage<DiscoveredOffer, { interpretation: Interpretation }>('/discover/offers', {
      auth: false,
      query: { ...JSON.parse(key), pageSize: 24 },
      signal: controller.signal,
    })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [loc.ready, key]);

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries({ page: '', ...changes })) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  const interp = result?.meta.interpretation;
  const page = Number(filters.page);

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q });
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search offers" aria-label="Search offers" />
        <button className="btn-primary" type="submit">
          Search
        </button>
      </form>

      <LocationBar state={loc} radiusOptions={meta.discovery.radiusOptionsKm} />

      <div className="flex flex-wrap gap-2 text-sm">
        <select className="input w-auto" aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.slug}>All {c.name}</option>
              {c.children.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select className="input w-auto" aria-label="Maximum price" value={filters.maxPriceRupees} onChange={(e) => update({ maxPriceRupees: e.target.value })}>
          <option value="">Any price</option>
          {[500, 1000, 2000, 5000, 10000].map((r) => (
            <option key={r} value={r}>
              Under {formatInr(r * 100)}
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Minimum discount" value={filters.minDiscount} onChange={(e) => update({ minDiscount: e.target.value })}>
          <option value="">Any discount</option>
          {[10, 20, 30, 50, 70].map((d) => (
            <option key={d} value={d}>
              {d}% or more
            </option>
          ))}
        </select>
        <select className="input w-auto" aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
          {SORTS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {interp && (interp.maxPrice !== null || interp.minDiscount !== null || interp.locality || interp.nearMe) && (
        <p className="text-sm text-gray-600">
          Showing
          {interp.text && <> “{interp.text}”</>}
          {interp.maxPrice !== null && <> under {formatInr(interp.maxPrice)}</>}
          {interp.minDiscount !== null && <> with {interp.minDiscount}%+ off</>}
          {interp.locality && <> in {interp.locality.name}</>}
          {interp.radiusKm !== null && <> within {interp.radiusKm} km</>}
        </p>
      )}
      {interp?.needsLocation && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          To see offers near you, tap “Use my location” above.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!result && !error && <p className="text-sm text-gray-500">Searching…</p>}
      {result && (
        <>
          <p className="text-sm text-gray-500">{result.meta.totalItems} offers</p>
          <OfferGrid offers={result.items} empty="No offers match. Try fewer filters or a larger distance." />
          {result.meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-secondary" disabled={page <= 1} onClick={() => update({ ...filters, page: String(page - 1) })}>
                Previous
              </button>
              <span className="text-sm">
                Page {page} of {result.meta.totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= result.meta.totalPages}
                onClick={() => update({ ...filters, page: String(page + 1) })}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
