'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BusinessForm } from '@/components/business-form';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { apiPage, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminBusiness, PageMeta } from '@/lib/types';

export default function AdminListingsPage() {
  return (
    <RequireAuth permission="businesses:manage">
      <Listings />
    </RequireAuth>
  );
}

/**
 * Platform listings (owner decision 2026-10-14): shops an admin lists from the brand's public offers
 * page. They go public at once, are shown as "listed", never as verified, and their offers run a week
 * at most. The admin who lists a shop becomes its owner and adds its offers in the business portal.
 */
function Listings() {
  const router = useRouter();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: AdminBusiness[]; meta: PageMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiPage<AdminBusiness>('/admin/businesses', {
      query: { listed: 'true', page, pageSize: 25 },
      signal: controller.signal,
    })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Listed shops</h1>
        {!adding && (
          <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
            List a shop
          </button>
        )}
      </div>
      <p className="max-w-3xl text-sm text-gray-600">
        Shops listed by our team from a brand&apos;s public offers page, such as a local fast-food outlet. Customers see
        them as listed from the brand&apos;s information, with a link to check it, never as verified. Type the details in
        your own words and don&apos;t upload the brand&apos;s logo, photos or artwork. You become the shop&apos;s owner on
        the website: add its offers in the business portal (they still need another admin&apos;s approval and run 7 days
        at most, so re-check the brand&apos;s page each week).
      </p>

      {adding && (
        <div className="card space-y-3">
          <h2 className="font-semibold">List a shop</h2>
          <BusinessForm listing onSaved={(b) => router.push(`/business/${b.id}`)} />
          <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && result.items.length === 0 && <p className="text-sm text-gray-500">No listed shops yet.</p>}
      {result && result.items.length > 0 && (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {result.items.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Link href={`/admin/businesses/${b.id}`} className="font-medium hover:text-brand-600">
                {b.name}
              </Link>
              <StatusBadge status={b.status} />
              <span className="text-gray-500">
                {b.address.locality?.name ?? b.address.city.name}
              </span>
              <span className="ml-auto flex gap-3">
                {b.sourceUrl && (
                  <a className="underline" href={b.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                    Brand page
                  </a>
                )}
                {user?.id === b.ownerUserId && (
                  <Link className="underline" href={`/business/${b.id}`}>
                    Offers
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {result && result.meta.totalPages > 1 && (
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={page >= result.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
