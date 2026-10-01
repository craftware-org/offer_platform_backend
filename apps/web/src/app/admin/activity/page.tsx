'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { ACTIVITY_TYPES, describeActivity, type ActivityEntry } from '@/lib/activity';
import { apiPage, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { PageMeta } from '@/lib/types';

export default function AdminActivityPage() {
  return (
    <RequireAuth permission="audit:read">
      <Suspense fallback={null}>
        <Activity />
      </Suspense>
    </RequireAuth>
  );
}

/** Where an item lives in the admin area, so a sentence can link to it. */
function itemLink(e: ActivityEntry): string | null {
  if (!e.entityId) return null;
  switch (e.entityType) {
    case 'business':
      return `/admin/businesses/${e.entityId}`;
    case 'offer':
      return `/admin/offers/${e.entityId}`;
    case 'user':
      return `/admin/users/${e.entityId}`;
    default:
      return null;
  }
}

function Activity() {
  const actor = useSearchParams().get('actor') ?? '';
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: ActivityEntry[]; meta: PageMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiPage<ActivityEntry>('/admin/activity', {
      query: { entityType: type, actorUserId: actor, page, pageSize: 30 },
      signal: controller.signal,
    })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [type, actor, page]);

  return (
    <div className="max-w-4xl space-y-3">
      <h1 className="text-xl font-semibold">Activity log</h1>
      <p className="text-sm text-gray-600">Every important action on the platform, newest first. Entries cannot be edited or deleted.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          aria-label="Show"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          {ACTIVITY_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {actor && (
          <Link href="/admin/activity" className="badge bg-brand-100 py-1 text-brand-700">
            Showing one user’s actions ✕
          </Link>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!result && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {result && result.items.length === 0 && <p className="text-sm text-gray-500">Nothing yet.</p>}
      {result && result.items.length > 0 && (
        <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {result.items.map((e) => {
            const link = itemLink(e);
            const hasDetails = e.oldValue != null || e.newValue != null;
            return (
              <li key={e.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time className="w-36 shrink-0 text-xs text-gray-500" dateTime={e.at}>
                    {formatDateTime(e.at)}
                  </time>
                  <span className="flex-1">{describeActivity(e)}</span>
                  {link && (
                    <Link href={link} className="text-xs text-brand-700 underline">
                      Open
                    </Link>
                  )}
                  {hasDetails && (
                    <button type="button" className="text-xs text-gray-600 underline" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      {open === e.id ? 'Hide details' : 'Details'}
                    </button>
                  )}
                </div>
                {open === e.id && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {e.oldValue != null && (
                      <div>
                        <p className="text-xs font-medium text-gray-500">Before</p>
                        <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(e.oldValue, null, 2)}</pre>
                      </div>
                    )}
                    {e.newValue != null && (
                      <div>
                        <p className="text-xs font-medium text-gray-500">After</p>
                        <pre className="overflow-x-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(e.newValue, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {result && result.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Newer
          </button>
          <span className="text-sm">
            Page {page} of {result.meta.totalPages}
          </span>
          <button className="btn-secondary" disabled={page >= result.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Older
          </button>
        </div>
      )}
    </div>
  );
}
