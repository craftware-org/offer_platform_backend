'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Report reasons from the product specification (§27), in plain words. */
export const REPORT_REASONS: [string, string][] = [
  ['OFFER_UNAVAILABLE', 'Offer not available at the shop'],
  ['WRONG_DISCOUNT', 'Wrong price or discount'],
  ['MISLEADING_INFORMATION', 'Misleading information'],
  ['BUSINESS_CLOSED', 'Shop is closed'],
  ['WRONG_LOCATION', 'Wrong location'],
  ['OFFENSIVE_CONTENT', 'Offensive content'],
  ['SUSPICIOUS_ACTIVITY', 'Looks like a scam'],
  ['OTHER', 'Something else'],
];

/** "Report this offer": logged-in users only (owner decision 2026-10-03). */
export function ReportOffer({ offerId }: { offerId: string }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) return <p className="text-sm text-green-700">Thanks. Our team will check this offer.</p>;
  if (!open) {
    return (
      <button type="button" className="text-sm text-gray-500 underline" onClick={() => setOpen(true)}>
        Report this offer
      </button>
    );
  }
  if (!user) {
    return (
      <p className="text-sm text-gray-600">
        Please{' '}
        <Link className="text-brand-700 underline" href={`/login?next=${encodeURIComponent(pathname)}`}>
          log in
        </Link>{' '}
        to report an offer.
      </p>
    );
  }

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api('/reports', { method: 'POST', body: { offerId, reason, note: note.trim() || undefined } });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">What’s wrong with this offer?</h2>
      <div className="space-y-1 text-sm">
        {REPORT_REASONS.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} required />
            {label}
          </label>
        ))}
      </div>
      <textarea
        className="input"
        rows={2}
        maxLength={1000}
        placeholder="Anything else we should know? (optional)"
        aria-label="Details"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button className="btn-danger" disabled={busy || !reason}>
          {busy ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
