'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AdminTwoStep } from '@/components/admin-two-step';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';
import type { AdminUser } from '@/lib/types';

const ADMIN_ROLES = [
  ['ADMIN', 'Admin', 'Reviews businesses and offers, manages categories, areas and users'],
  ['SUPER_ADMIN', 'Super admin', 'Everything an admin does, plus roles and platform settings'],
] as const;

export default function AdminUserPage() {
  return (
    <RequireAuth permission="users:read">
      <UserDetail />
    </RequireAuth>
  );
}

function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { user: me, can } = useAuth();
  const [u, setU] = useState<AdminUser | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setU(await api<AdminUser>(`/admin/users/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setReason('');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!u) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-500">Loading…</p>;
  const isMe = me?.id === u.id;

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/admin/users" className="text-sm text-gray-600 underline">
        ← Users
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{u.name ?? 'No name'}</h1>
        <StatusBadge status={u.status} />
        {isMe && <span className="badge bg-gray-100 text-gray-700">you</span>}
      </div>

      <section className="card text-sm">
        <dl className="grid grid-cols-3 gap-1">
          <dt className="text-gray-500">Email</dt>
          <dd className="col-span-2">
            {u.email ?? '—'} {u.email && (u.emailVerified ? '(verified)' : '(not verified)')}
          </dd>
          <dt className="text-gray-500">Phone</dt>
          <dd className="col-span-2">{u.phone ?? '—'}</dd>
          <dt className="text-gray-500">Password set</dt>
          <dd className="col-span-2">{u.hasPassword ? 'Yes' : 'No (logs in with codes)'}</dd>
          <dt className="text-gray-500">Joined</dt>
          <dd className="col-span-2">{formatDateTime(u.createdAt)}</dd>
          <dt className="text-gray-500">Last login</dt>
          <dd className="col-span-2">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</dd>
          <dt className="text-gray-500">Roles</dt>
          <dd className="col-span-2">{u.roles.join(', ') || '—'}</dd>
        </dl>
        {can('audit:read') && (
          <Link href={`/admin/activity?actor=${u.id}`} className="mt-3 inline-block text-brand-700 underline">
            See what this user did
          </Link>
        )}
      </section>

      {can('users:manage-status') && u.status !== 'DELETED' && !isMe && (
        <section className="card space-y-3">
          <h2 className="font-semibold">{u.status === 'SUSPENDED' ? 'Reactivate account' : 'Suspend account'}</h2>
          <p className="text-sm text-gray-600">
            {u.status === 'SUSPENDED'
              ? 'The user can log in again.'
              : 'The user is logged out everywhere and cannot log in until reactivated.'}
          </p>
          <label className="label" htmlFor="reason">
            Reason (kept in the activity log)
          </label>
          <textarea id="reason" className="input" rows={2} minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button
            className={u.status === 'SUSPENDED' ? 'btn-primary' : 'btn-danger'}
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              void run(() =>
                api(`/admin/users/${u.id}/status`, {
                  method: 'PATCH',
                  body: { status: u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED', reason: reason.trim() },
                }),
              )
            }
          >
            {u.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
          </button>
        </section>
      )}

      {(u.roles.includes('ADMIN') || u.roles.includes('SUPER_ADMIN')) && <AdminTwoStep userId={u.id} isMe={isMe} />}

      {can('roles:assign') && u.status === 'ACTIVE' && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Admin roles</h2>
          {ADMIN_ROLES.map(([role, label, help]) => {
            const has = u.roles.includes(role);
            const selfLockout = isMe && role === 'SUPER_ADMIN' && has;
            return (
              <div key={role} className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">{label}</p>
                  <p className="text-gray-600">{help}</p>
                </div>
                {selfLockout ? (
                  <span className="text-xs text-gray-500">You can’t remove your own Super admin role.</span>
                ) : (
                  <button
                    className={has ? 'btn-secondary' : 'btn-primary'}
                    disabled={busy}
                    onClick={() => {
                      const question = has ? `Remove the ${label} role from this user?` : `Make this user ${label}?`;
                      if (!window.confirm(question)) return;
                      void run(() =>
                        has
                          ? api(`/admin/users/${u.id}/roles/${role}`, { method: 'DELETE' })
                          : api(`/admin/users/${u.id}/roles`, { method: 'POST', body: { role } }),
                      );
                    }}
                  >
                    {has ? `Remove ${label}` : `Make ${label}`}
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
