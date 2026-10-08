'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { NOTIFICATIONS_CHANGED } from '@/components/notification-bell';
import { RequireAuth } from '@/components/require-auth';
import { api, apiPage, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { PageMeta } from '@/lib/types';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <Inbox />
    </RequireAuth>
  );
}

function Inbox() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: Notification[]; meta: PageMeta & { unread: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResult(await apiPage<Notification, { unread: number }>('/me/notifications', { query: { page, pageSize: 30 } }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [page]);
  useEffect(() => {
    void load();
  }, [load]);

  async function open(n: Notification) {
    if (!n.read) {
      await api('/me/notifications/read', { method: 'POST', body: { ids: [n.id] } }).catch(() => {});
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    }
    if (n.link) router.push(n.link);
    else void load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Notifications</h1>
        {result && result.meta.unread > 0 && (
          <button
            className="btn-secondary ml-auto py-1.5"
            onClick={async () => {
              await api('/me/notifications/read', { method: 'POST', body: { all: true } });
              window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
              await load();
            }}
          >
            Mark all as read
          </button>
        )}
      </div>
      <p className="text-sm text-gray-600">
        Choose what you hear about, and how, in{' '}
        <Link className="text-brand-700 underline" href="/account#notifications">
          notification settings
        </Link>
        .
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result?.items.length === 0 && <p className="card text-sm text-gray-600">No notifications yet.</p>}
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {result?.items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              className={`flex w-full gap-3 p-3 text-left text-sm hover:bg-gray-50 ${n.read ? 'text-gray-600' : ''}`}
              onClick={() => void open(n)}
            >
              <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} />
              <span className="flex-1">
                <span className={`block ${n.read ? '' : 'font-semibold'}`}>{n.title}</span>
                <span className="block text-gray-600">{n.body}</span>
                <span className="block text-xs text-gray-400">{formatDateTime(n.createdAt)}</span>
              </span>
              {!n.read && <span className="sr-only">unread</span>}
            </button>
          </li>
        ))}
      </ul>
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
