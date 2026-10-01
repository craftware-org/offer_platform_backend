'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { apiPage, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { AdminUser, PageMeta } from '@/lib/types';

export default function AdminUsersPage() {
  return (
    <RequireAuth permission="users:read">
      <Users />
    </RequireAuth>
  );
}

function Users() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ items: AdminUser[]; meta: PageMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiPage<AdminUser>('/admin/users', {
      query: { search: search.trim() || undefined, status, page, pageSize: 25 },
      signal: controller.signal,
    })
      .then(setResult)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, [search, status, page]);

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Users</h1>
      <div className="flex flex-wrap gap-2">
        <input
          className="input w-72"
          placeholder="Search name, phone or email"
          aria-label="Search users"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="input w-auto"
          aria-label="Status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <>
          <p className="text-sm text-gray-500">{result.meta.totalItems} users</p>
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
            {result.items.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-gray-50">
                <span className="font-medium">{u.name ?? 'No name'}</span>
                <span className="text-sm text-gray-600">{[u.email, u.phone].filter(Boolean).join(' · ')}</span>
                {u.roles
                  .filter((r) => r === 'ADMIN' || r === 'SUPER_ADMIN')
                  .map((r) => (
                    <span key={r} className="badge bg-brand-100 text-brand-700">
                      {r === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
                    </span>
                  ))}
                <span className="ml-auto text-xs text-gray-500">
                  {u.lastLoginAt ? `last login ${formatDateTime(u.lastLoginAt)}` : `joined ${formatDateTime(u.createdAt)}`}
                </span>
                <StatusBadge status={u.status} />
              </Link>
            ))}
          </div>
          {result.meta.totalPages > 1 && (
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
        </>
      )}
    </div>
  );
}
