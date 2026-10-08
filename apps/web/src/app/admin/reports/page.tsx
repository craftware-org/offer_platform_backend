'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { REPORT_REASONS } from '@/components/report-offer';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { apiPage, errorMessage } from '@/lib/api';
import type { AdminReport } from '@/lib/reports';
import { formatDateTime } from '@/lib/time';
import type { PageMeta } from '@/lib/types';

const reasonLabel = (r: string) => REPORT_REASONS.find(([v]) => v === r)?.[1] ?? r;

export default function AdminReportsPage() {
  return (
    <RequireAuth permission="reports:moderate">
      <Reports />
    </RequireAuth>
  );
}

function Reports() {
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: AdminReport[]; meta: PageMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiPage<AdminReport>('/admin/reports', { query: { status, page, pageSize: 30 }, signal: controller.signal })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [status, page]);

  return (
    <div className="max-w-4xl space-y-3">
      <h1 className="text-xl font-semibold">Customer reports</h1>
      <select
        className="input w-auto"
        aria-label="Status"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      >
        <option value="OPEN">Open (oldest first)</option>
        <option value="RESOLVED">Resolved</option>
        <option value="DISMISSED">Dismissed</option>
        <option value="">All</option>
      </select>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result?.items.length === 0 && <p className="text-sm text-gray-500">Nothing here.</p>}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {result?.items.map((r) => (
          <Link key={r.id} href={`/admin/reports/${r.id}`} className="flex flex-wrap items-center gap-3 p-3 text-sm hover:bg-gray-50">
            <span className="font-medium">{reasonLabel(r.reason)}</span>
            <span className="text-gray-600">
              “{r.offer.title ?? 'offer'}” · {r.business.name ?? 'business'}
            </span>
            {r.status === 'OPEN' && r.openReportsOnOffer > 1 && (
              <span className="badge bg-red-100 text-red-800">{r.openReportsOnOffer} open on this offer</span>
            )}
            <span className="ml-auto text-xs text-gray-500">{formatDateTime(r.createdAt)}</span>
            <StatusBadge status={r.status} />
          </Link>
        ))}
      </div>
      {result && result.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-sm">
            Page {page} of {result.meta.totalPages}
          </span>
          <button className="btn-secondary" disabled={page >= result.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
