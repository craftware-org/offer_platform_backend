'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { REPORT_REASONS } from '@/components/report-offer';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ACTION_LABELS, REPORT_ACTIONS, type AdminReport } from '@/lib/reports';
import { formatDateTime } from '@/lib/time';

const reasonLabel = (r: string) => REPORT_REASONS.find(([v]) => v === r)?.[1] ?? r;

export default function AdminReportPage() {
  return (
    <RequireAuth permission="reports:moderate">
      <Report />
    </RequireAuth>
  );
}

function Report() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [r, setR] = useState<AdminReport | null>(null);
  const [pending, setPending] = useState<(typeof REPORT_ACTIONS)[number] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setR(await api<AdminReport>(`/admin/reports/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      setR(await api<AdminReport>(`/admin/reports/${id}`, { method: 'PATCH', body: { action: pending.action, note: note.trim() || undefined } }));
      setPending(null);
      setNote('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!r) return error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-500">Loading…</p>;
  const needsNote = pending && pending.action !== 'DISMISS';

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/admin/reports" className="text-sm text-gray-600 underline">
        ← Reports
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{reasonLabel(r.reason)}</h1>
        <StatusBadge status={r.status} />
      </div>

      <section className="card space-y-1 text-sm">
        <p>
          <span className="text-gray-500">Offer:</span>{' '}
          <Link className="text-brand-700 underline" href={`/admin/offers/${r.offer.id}`}>
            {r.offer.title ?? 'open offer'}
          </Link>
        </p>
        <p>
          <span className="text-gray-500">Business:</span>{' '}
          <Link className="text-brand-700 underline" href={`/admin/businesses/${r.business.id}`}>
            {r.business.name ?? 'open business'}
          </Link>
        </p>
        <p>
          <span className="text-gray-500">Reported by:</span> {r.reporter?.name ?? 'deleted account'} ·{' '}
          {formatDateTime(r.createdAt)}
        </p>
        {r.note && <p className="pt-2 whitespace-pre-line">“{r.note}”</p>}
        {r.status === 'OPEN' && r.openReportsOnOffer > 1 && (
          <p className="pt-2 font-medium text-red-700">{r.openReportsOnOffer} people have open reports on this offer.</p>
        )}
      </section>

      {r.actions && r.actions.length > 0 && (
        <section className="card space-y-1 text-sm">
          <h2 className="font-semibold">What was done</h2>
          {r.actions.map((a, i) => (
            <p key={i}>
              {formatDateTime(a.at)} · {a.by ?? 'Admin'} · {ACTION_LABELS[a.action] ?? a.action}
              {a.note && `: “${a.note}”`}
            </p>
          ))}
        </section>
      )}

      {r.status === 'OPEN' && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Decision</h2>
          <div className="space-y-2">
            {REPORT_ACTIONS.filter((a) => !a.permission || can(a.permission)).map((a) => (
              <label key={a.action} className="flex items-start gap-2 text-sm" aria-label={a.label}>
                <input type="radio" name="action" checked={pending?.action === a.action} onChange={() => setPending(a)} />
                <span>
                  <span className="font-medium">{a.label}</span>
                  <span className="block text-gray-600">{a.help}</span>
                </span>
              </label>
            ))}
          </div>
          {pending && (
            <>
              <label className="label" htmlFor="note">
                {pending.action === 'WARN_BUSINESS'
                  ? 'Message to the business'
                  : pending.action === 'DISMISS'
                    ? 'Note (optional, internal)'
                    : 'Reason (the business sees it)'}
              </label>
              <textarea id="note" className="input" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
              <button className={pending.style} disabled={busy || (!!needsNote && note.trim().length < 3)} onClick={() => void act()}>
                {busy ? 'Saving…' : `Confirm: ${pending.label}`}
              </button>
            </>
          )}
        </section>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
