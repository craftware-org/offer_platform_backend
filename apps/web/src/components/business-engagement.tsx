'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { changeLabel, contactTaps, totalViews, type BusinessInsights } from '@/lib/insights';
import { formatDateTime } from '@/lib/time';
import { StatCard } from './range-picker';
import { REPORT_REASONS } from './report-offer';

interface Warning {
  at: string;
  message: string;
  reason: string;
  offer: { id: string; title: string | null };
}

const reasonLabel = (r: string) => REPORT_REASONS.find(([v]) => v === r)?.[1] ?? r;

/**
 * Warnings from the platform plus the last 30 days at a glance (Phase 7); the full Performance page
 * has charts, other periods and per-offer numbers.
 */
export function BusinessEngagementPanel({ businessId }: { businessId: string }) {
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);

  useEffect(() => {
    api<BusinessInsights>(`/me/businesses/${businessId}/insights`, { query: { days: 30 } })
      .then(setData)
      .catch(() => setData(null));
    api<{ followers: number }>(`/me/businesses/${businessId}/engagement`)
      .then((e) => setFollowers(e.followers))
      .catch(() => setFollowers(null));
    api<Warning[]>(`/me/businesses/${businessId}/warnings`)
      .then(setWarnings)
      .catch(() => setWarnings([]));
  }, [businessId]);

  const t = data?.totals;
  const p = data?.previous;

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

      {t && p && (
        <section className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Last 30 days</h2>
            {followers !== null && (
              <span className="text-sm text-gray-600">
                · {followers} {followers === 1 ? 'follower' : 'followers'} in total
              </span>
            )}
            <Link href={`/business/${businessId}/insights`} className="btn-secondary ml-auto py-1.5">
              See performance
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Page views" value={totalViews(t)} change={changeLabel(totalViews(t), totalViews(p))} />
            <StatCard label="Contact taps" value={contactTaps(t)} change={changeLabel(contactTaps(t), contactTaps(p))} />
            <StatCard label="Saves" value={t.saves} change={changeLabel(t.saves, p.saves)} />
            <StatCard label="Shares" value={t.shares} change={changeLabel(t.shares, p.shares)} />
          </div>
        </section>
      )}
    </>
  );
}
