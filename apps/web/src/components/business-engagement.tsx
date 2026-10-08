'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import { REPORT_REASONS } from './report-offer';

interface Counts {
  saves: number;
  shares: number;
  calls: number;
  whatsapp: number;
  website: number;
  directions: number;
}
interface Engagement {
  followers: number;
  totals: Counts;
  offers: (Counts & { offerId: string; title: string })[];
}
interface Warning {
  at: string;
  message: string;
  reason: string;
  offer: { id: string; title: string | null };
}

const COLUMNS: [keyof Counts, string][] = [
  ['saves', 'Saves'],
  ['shares', 'Shares'],
  ['calls', 'Calls'],
  ['whatsapp', 'WhatsApp'],
  ['directions', 'Directions'],
  ['website', 'Website'],
];
const reasonLabel = (r: string) => REPORT_REASONS.find(([v]) => v === r)?.[1] ?? r;

/**
 * Warnings from the platform plus simple engagement totals (Phase 5; charts and date ranges come
 * in Phase 7). Taps are counted only for logged-in customers, so real interest is higher.
 */
export function BusinessEngagementPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<Engagement | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);

  useEffect(() => {
    api<Engagement>(`/me/businesses/${businessId}/engagement`)
      .then(setData)
      .catch(() => setData(null));
    api<Warning[]>(`/me/businesses/${businessId}/warnings`)
      .then(setWarnings)
      .catch(() => setWarnings([]));
  }, [businessId]);

  return (
    <>
      {warnings.length > 0 && (
        <section className="card space-y-2 border-amber-300 bg-amber-50">
          <h2 className="font-semibold text-amber-900">Messages from our team</h2>
          {warnings.map((w, i) => (
            <div key={i} className="text-sm text-amber-900">
              <p>
                <span className="font-medium">{formatDateTime(w.at)}</span> · about “{w.offer.title ?? 'an offer'}” ·{' '}
                customers reported: {reasonLabel(w.reason).toLowerCase()}
              </p>
              <p className="pl-2">“{w.message}”</p>
            </div>
          ))}
        </section>
      )}

      {data && (
        <section className="card space-y-3">
          <h2 className="font-semibold">How customers interact with you</h2>
          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-7">
            <Stat label="Followers" value={data.followers} />
            {COLUMNS.map(([key, label]) => (
              <Stat key={key} label={label} value={data.totals[key]} />
            ))}
          </div>
          {data.offers.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-3 font-medium">Offer</th>
                    {COLUMNS.map(([key, label]) => (
                      <th key={key} className="px-2 py-1 text-right font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.offers.map((o) => (
                    <tr key={o.offerId}>
                      <td className="py-1 pr-3">{o.title}</td>
                      {COLUMNS.map(([key]) => (
                        <td key={key} className="px-2 py-1 text-right tabular-nums">
                          {o[key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-gray-500">Counted for logged-in customers only. Charts by date are coming later.</p>
        </section>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-gray-600">{label}</p>
    </div>
  );
}
