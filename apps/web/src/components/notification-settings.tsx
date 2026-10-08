'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Preference {
  type: string;
  audience: 'BUSINESS' | 'CUSTOMER' | 'ADMIN';
  label: string;
  inApp: boolean;
  email: boolean;
  defaults: { inApp: boolean; email: boolean };
}

const GROUPS: [Preference['audience'], string][] = [
  ['CUSTOMER', 'As a customer'],
  ['BUSINESS', 'For your shop'],
  ['ADMIN', 'Admin'],
];

/** Inbox / email choice per notification type (Phase 6). Emails go only to a verified address. */
export function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<Preference[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Preference[]>('/me/notification-preferences')
      .then(setPrefs)
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function change(p: Preference, channel: 'inApp' | 'email', value: boolean) {
    const next = { ...p, [channel]: value };
    setPrefs((list) => list?.map((x) => (x.type === p.type ? next : x)) ?? null); // optimistic
    setError(null);
    try {
      await api('/me/notification-preferences', { method: 'PUT', body: { type: p.type, inApp: next.inApp, email: next.email } });
    } catch (e) {
      setPrefs((list) => list?.map((x) => (x.type === p.type ? p : x)) ?? null);
      setError(errorMessage(e));
    }
  }

  const hasVerifiedEmail = !!user?.email && user.emailVerified;

  return (
    <section id="notifications" className="card space-y-3">
      <h2 className="font-semibold">Notifications</h2>
      {!hasVerifiedEmail && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          Emails go only to a verified address. Log in once with a code sent to your email to verify it; until then you
          get notifications in the 🔔 inbox only.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!prefs && !error && <p className="text-sm text-gray-500">Loading…</p>}
      {prefs &&
        GROUPS.map(([audience, title]) => {
          const items = prefs.filter((p) => p.audience === audience);
          if (items.length === 0) return null;
          return (
            <div key={audience} className="space-y-1">
              <h3 className="text-sm font-medium text-gray-700">{title}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500">
                    <th className="py-1 font-normal">Message</th>
                    <th className="w-16 py-1 text-center font-normal">Inbox</th>
                    <th className="w-16 py-1 text-center font-normal">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.type} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2">{p.label}</td>
                      <td className="text-center">
                        <input type="checkbox" aria-label={`${p.label}: inbox`} checked={p.inApp} onChange={(e) => void change(p, 'inApp', e.target.checked)} />
                      </td>
                      <td className="text-center">
                        <input
                          type="checkbox"
                          aria-label={`${p.label}: email`}
                          checked={p.email}
                          disabled={!hasVerifiedEmail}
                          onChange={(e) => void change(p, 'email', e.target.checked)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      <p className="text-xs text-gray-500">Customer emails are never sent between 10 pm and 8 am; they arrive at 8 am.</p>
    </section>
  );
}
