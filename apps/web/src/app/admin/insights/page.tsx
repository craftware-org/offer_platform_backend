'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BarList, DailyChart, MiniBars } from '@/components/charts';
import { RangePicker, StatCard } from '@/components/range-picker';
import { RequireAuth } from '@/components/require-auth';
import { api, errorMessage } from '@/lib/api';
import { changeLabel, shortDay, waitedFor, type AdminInsights, type RangeDays } from '@/lib/insights';

export default function AdminInsightsPage() {
  return (
    <RequireAuth permission="analytics:read">
      <Insights />
    </RequireAuth>
  );
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Not submitted',
  UNDER_REVIEW: 'Waiting for review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};
const sumOf = (s: { value: number }[]) => s.reduce((n, p) => n + p.value, 0);

/** Phase 7: the platform at a glance, for admins. */
function Insights() {
  const [days, setDays] = useState<RangeDays>(30);
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<{ slug: string; name: string }[]>([]);
  const [data, setData] = useState<AdminInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ slug: string; name: string }[]>('/cities', { auth: false })
      .then(setCities)
      .catch(() => {});
  }, []);
  useEffect(() => {
    setError(null);
    api<AdminInsights>('/admin/insights', { query: { days, city } })
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, [days, city]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Insights</h1>
        <div className="ml-auto">
          <RangePicker value={days} onChange={setDays} />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <p className="text-sm text-gray-600">
            {shortDay(data.range.from)} – {shortDay(data.range.to)} (today included).
          </p>

          <section className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['Businesses waiting', data.queues.businesses, '/admin'],
                ['Offers waiting', data.queues.offers, '/admin'],
                ['Open reports', data.queues.reports, '/admin/reports'],
              ] as const
            ).map(([label, q, href]) => (
              <Link key={label} href={href} className={`card block ${q.waiting > 0 ? 'border-amber-300 bg-amber-50' : ''}`}>
                <p className="text-xs text-gray-600">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{q.waiting}</p>
                <p className="text-xs text-gray-600">{q.waiting > 0 ? `oldest waiting ${waitedFor(q.oldestSince)}` : 'nothing waiting'}</p>
              </Link>
            ))}
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Customers and visits</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Page views" value={data.engagement.totals.views} change={changeLabel(data.engagement.totals.views, data.engagement.previous.views)} />
              <StatCard label="Taps (contact + shares)" value={data.engagement.totals.taps} change={changeLabel(data.engagement.totals.taps, data.engagement.previous.taps)} />
              <StatCard label="Saves" value={data.engagement.totals.saves} change={changeLabel(data.engagement.totals.saves, data.engagement.previous.saves)} />
              <StatCard label="Follows" value={data.engagement.totals.follows} change={changeLabel(data.engagement.totals.follows, data.engagement.previous.follows)} />
            </div>
            <DailyChart points={data.engagement.daily} />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-3">
              <h2 className="font-semibold">People</h2>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Accounts" value={data.users.total} />
                <StatCard label="Active, 7 days" value={data.users.active7} />
                <StatCard label="Active, 30 days" value={data.users.active30} />
              </div>
              <div>
                <p className="text-sm">Sign-ups: {sumOf(data.users.signups)}</p>
                <MiniBars points={data.users.signups} label="Sign-ups per day" />
              </div>
              <div>
                <p className="text-sm">Logins: {sumOf(data.users.logins)}</p>
                <MiniBars points={data.users.logins} label="Logins per day" />
              </div>
            </div>

            <div className="card space-y-3">
              <h2 className="font-semibold">Shops and offers</h2>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Live offers now" value={data.offers.liveNow} />
                <StatCard label="Offers published" value={sumOf(data.offers.published)} />
                <StatCard label="New shops" value={sumOf(data.businesses.new)} />
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                {data.businesses.byStatus.map((s) => (
                  <li key={s.status}>
                    {STATUS_LABEL[s.status] ?? s.status}: <span className="tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-medium text-gray-700">Live offers by city</h3>
                  <BarList items={data.offers.liveByCity} empty="No live offers." />
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium text-gray-700">Live offers by category</h3>
                  <BarList items={data.offers.liveByCategory} empty="No live offers." />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="card space-y-2">
              <h2 className="font-semibold">Most viewed offers</h2>
              <TopTable
                rows={data.topOffers.map((o) => ({ key: o.offerId, href: `/offers/${o.slug}`, label: o.title, sub: o.business, views: o.views, taps: o.taps }))}
              />
            </div>
            <div className="card space-y-2">
              <h2 className="font-semibold">Most visited shops</h2>
              <TopTable rows={data.topBusinesses.map((b) => ({ key: b.businessId, href: `/businesses/${b.slug}`, label: b.name, views: b.views, taps: b.taps }))} />
            </div>
          </section>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">What people search for</h2>
              <span className="text-sm text-gray-600">{data.searches.total} searches</span>
              <label className="ml-auto flex items-center gap-2 text-sm">
                City
                <select className="input py-1" value={city} onChange={(e) => setCity(e.target.value)}>
                  <option value="">All</option>
                  {cities.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-1 text-sm font-medium text-gray-700">Top searches</h3>
                <BarList items={data.searches.top.map((s) => ({ label: s.query, value: s.count }))} empty="No searches yet." />
              </div>
              <div>
                <h3 className="mb-1 text-sm font-medium text-gray-700">Searches that found nothing</h3>
                <p className="mb-1 text-xs text-gray-500">What people want that no shop offers yet.</p>
                <BarList items={data.searches.noResults.map((s) => ({ label: s.query, value: s.count }))} empty="Every search found something." />
              </div>
            </div>
          </section>
          <p className="text-xs text-gray-500">
            Everyone is counted, logged in or not, once per visitor per 30 minutes; bots, shop staff and admins are not.
            No names, locations or IP addresses are stored. Searches are saved without who searched; numbers longer
            than 4 digits are hidden.
          </p>
        </>
      )}
    </div>
  );
}

function TopTable({ rows }: { rows: { key: string; href: string; label: string; sub?: string; views: number; taps: number }[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">No visits yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500">
          <th className="py-1 font-medium">Name</th>
          <th className="px-2 py-1 text-right font-medium">Views</th>
          <th className="px-2 py-1 text-right font-medium">Taps</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="py-1.5">
              <Link href={r.href} className="hover:underline">
                {r.label}
              </Link>
              {r.sub && <span className="block text-xs text-gray-500">{r.sub}</span>}
            </td>
            <td className="px-2 text-right tabular-nums">{r.views}</td>
            <td className="px-2 text-right tabular-nums">{r.taps}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
