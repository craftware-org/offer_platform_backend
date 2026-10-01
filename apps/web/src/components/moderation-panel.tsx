'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export interface ModerationAction {
  action: string;
  label: string;
  needsReason: boolean;
  style: string;
}

/** Admin actions on a business or offer: PATCH `path` with { action, reason }. The API checks permissions and transitions. */
export function ModerationPanel<T>({
  path,
  actions,
  onDone,
}: {
  path: string;
  actions: ModerationAction[];
  onDone: (updated: T) => void;
}) {
  const [pending, setPending] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(a: ModerationAction, why?: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await api<T>(path, { method: 'PATCH', body: why ? { action: a.action, reason: why } : { action: a.action } });
      setPending(null);
      setReason('');
      onDone(updated);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (actions.length === 0) return null;
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold">Decision</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.action}
            className={a.style}
            disabled={busy}
            onClick={() => (a.needsReason ? setPending(a) : void run(a))}
          >
            {a.label}
          </button>
        ))}
      </div>
      {pending && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(pending, reason.trim());
          }}
        >
          <label className="label" htmlFor="reason">
            Reason (shown to the business)
          </label>
          <textarea id="reason" className="input" rows={3} minLength={3} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <button className={pending.style} disabled={busy || reason.trim().length < 3}>
              Confirm: {pending.label}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
