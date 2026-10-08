'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DailyChart } from '@/components/charts';
import { RangePicker, StatCard } from '@/components/range-picker';
import { RequireAuth } from '@/components/require-auth';
import { StatusBadge } from '@/components/status-badge';
import { api, errorMessage } from '@/lib/api';
import { changeLabel, contactTaps, shortDay, totalViews, type BusinessInsights, type RangeDays } from '@/lib/insights';

export default function BusinessInsightsPage() {
  return (
    <RequireAuth>
      <Insights />
    </RequireAuth>
  );
}

/** Phase 7: how a shop's offers perform, for the owner and staff. */
function Insights() {
  const { id } = useParams<{ id: string }>();
  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    api<BusinessInsights>(`/me/businesses/${id}/insights`, { query: { days } })
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [id, days]);

  const t = data?.totals;
  const p = data?.previous;
  const best = data?.offers.find((o) => o.offerId === data.bestOfferId);

  return (
    <div className="space-y-4">
      <Link href={`/business/${id}`} className="text-sm text-brand-700 underline">
        ← Back to the shop dashboard
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Performance</h1>
        <div className="ml-auto">
          <RangePicker value={days} onChange={setDays} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

      {data && t && p && (
        <>
          <p className="text-sm text-gray-600">
            {shortDay(data.range.from)} – {shortDay(data.range.to)} (today included). Numbers update as people visit.
          </p>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label="Page views" value={totalViews(t)} change={changeLabel(totalViews(t), totalViews(p))} />
            <StatCard label="Calls, WhatsApp, directions, website" value={contactTaps(t)} change={changeLabel(contactTaps(t), contactTaps(p))} />
            <StatCard label="Saves" value={t.saves} change={changeLabel(t.saves, p.saves)} />
            <StatCard label="New followers" value={t.follows} change={changeLabel(t.follows, p.follows)} />
          </section>

          <section className="card space-y-2">
            <h2 className="font-semibold">Day by day</h2>
            <DailyChart points={data.daily} />
            <dl className="grid grid-cols-3 gap-2 pt-1 text-center text-xs text-gray-600 sm:grid-cols-6">
              {(
                [
                  ['Offer views', t.offerViews],
                  ['Shop page views', t.shopViews],
                  ['Shares', t.shares],
                  ['Calls', t.calls],
                  ['WhatsApp', t.whatsapp],
                  ['Directions', t.directions],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="text-base font-semibold text-gray-900 tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {best && (
            <section className="card border-green-200 bg-green-50 text-sm">
              <h2 className="font-semibold text-green-900">Best offer in this period</h2>
              <p className="text-green-900">
                “{best.title}”: {best.views} views, {best.contactTaps} contact taps, {best.saves} saves.
              </p>
            </section>
          )}

          <section className="card space-y-2">
            <h2 className="font-semibold">Your offers</h2>
            {data.offers.length === 0 ? (
              <p className="text-sm text-gray-600">No live offers in this period. Publish an offer to start seeing numbers.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1 pr-3 font-medium">Offer</th>
                      <th className="px-2 py-1 text-right font-medium">Views</th>
                      <th className="px-2 py-1 text-right font-medium">Saves</th>
                      <th className="px-2 py-1 text-right font-medium">Shares</th>
                      <th className="px-2 py-1 text-right font-medium">Contact taps</th>
                      <th className="px-2 py-1 text-right font-medium" title="Shares and contact taps per 100 views">
                        Taps / 100 views
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.offers.map((o) => (
                      <tr key={o.offerId}>
                        <td className="py-1.5 pr-3">
                          <Link href={`/business/offers/${o.offerId}`} className="hover:underline">
                            {o.title}
                          </Link>{' '}
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-2 text-right tabular-nums">{o.views}</td>
                        <td className="px-2 text-right tabular-nums">{o.saves}</td>
                        <td className="px-2 text-right tabular-nums">{o.shares}</td>
                        <td className="px-2 text-right tabular-nums">{o.contactTaps}</td>
                        <td className="px-2 text-right tabular-nums">{o.tapsPer100Views ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="text-xs text-gray-500">
            Everyone is counted, logged in or not; the same visitor counts once per 30 minutes. Visits by your own staff
            are not counted. We never see who the visitors are.
          </p>
        </>
      )}
    </div>
  );
}
