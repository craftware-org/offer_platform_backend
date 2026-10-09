'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/time';

/**
 * A user's 2-step login as admins see it (ADR-0018). Super admins (roles:assign) can reset it when
 * someone lost their phone: the authenticator and recovery codes are removed and every session ends.
 */
export function AdminTwoStep({ userId, isMe }: { userId: string; isMe: boolean }) {
  const { can } = useAuth();
  const [status, setStatus] = useState<{ enabled: boolean; enabledAt: string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ enabled: boolean; enabledAt: string | null }>(`/admin/users/${userId}/mfa`)
      .then(setStatus)
      .catch((e) => setError(errorMessage(e)));
  }, [userId]);

  if (!status && !error) return null;

  async function reset() {
    if (!window.confirm("Reset this person's 2-step login? Their authenticator and recovery codes stop working, and they are logged out everywhere.")) return;
    setError(null);
    try {
      await api(`/admin/users/${userId}/mfa/reset`, { method: 'POST' });
      setStatus({ enabled: false, enabledAt: null });
      setMessage('Reset. They set up their authenticator again at their next admin visit.');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="card space-y-2 text-sm">
      <h2 className="font-semibold">2-step login</h2>
      {status && (
        <p>
          {status.enabled
            ? `On since ${status.enabledAt ? formatDateTime(status.enabledAt) : '—'}.`
            : 'Off. This person needs it before they can use the admin area.'}
        </p>
      )}
      {status?.enabled && can('roles:assign') && !isMe && (
        <button className="btn-secondary" onClick={() => void reset()}>
          Reset 2-step login (lost phone)
        </button>
      )}
      {message && <p className="text-green-700">{message}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </section>
  );
}
