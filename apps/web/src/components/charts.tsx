import { niceMax, shortDay, type DayPoint, type LabelCount } from '@/lib/insights';

/**
 * Small charts drawn with plain SVG and CSS (ADR-0017: no chart library; nothing extra to download,
 * works with the site's security policy). The drawings are hidden from screen readers, which read a
 * one-line text summary instead.
 */

const W = 640;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

/** Daily page views (bars) and taps (line). */
export function DailyChart({ points }: { points: DayPoint[] }) {
  const max = niceMax(Math.max(...points.map((p) => Math.max(p.views, p.taps)), 0));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(points.length, 1);
  const barW = Math.max(1, Math.min(18, slot * 0.7));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const labelEvery = Math.ceil(points.length / 6);
  const totalViews = points.reduce((n, p) => n + p.views, 0);
  const totalTaps = points.reduce((n, p) => n + p.taps, 0);
  const summary = `${points.length} days: ${totalViews} views and ${totalTaps} taps in total; the busiest day had ${Math.max(0, ...points.map((p) => p.views))} views.`;

  return (
    <figure className="space-y-1">
      <p className="sr-only">{summary}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} className="stroke-gray-200" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(max * f) + 4} textAnchor="end" className="fill-gray-500 text-[10px]">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <rect key={p.day} x={x(i) - barW / 2} y={y(p.views)} width={barW} height={Math.max(0, y(0) - y(p.views))} rx={2} className="fill-brand-500/70">
            <title>{`${shortDay(p.day)}: ${p.views} views, ${p.taps} taps`}</title>
          </rect>
        ))}
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.taps)}`).join(' ')}
          fill="none"
          className="stroke-emerald-600"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.day} x={x(i)} y={H - 6} textAnchor="middle" className="fill-gray-500 text-[10px]">
              {shortDay(p.day)}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex gap-4 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-500/70" /> Views
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden className="inline-block h-0.5 w-3 bg-emerald-600" /> Taps (calls, WhatsApp, directions, website, shares)
        </span>
      </figcaption>
    </figure>
  );
}

/** One line per day with a single value (sign-ups, logins…), as small bars. */
export function MiniBars({ points, label }: { points: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const total = points.reduce((n, p) => n + p.value, 0);
  return (
    <div className="space-y-1">
      <p className="sr-only">{`${label}: ${total} in ${points.length} days`}</p>
      <svg viewBox={`0 0 ${points.length * 10} 40`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
        {points.map((p, i) => (
          <rect key={p.day} x={i * 10 + 1} y={40 - (p.value / max) * 38} width={8} height={(p.value / max) * 38} className="fill-brand-500/70">
            <title>{`${shortDay(p.day)}: ${p.value}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

/** Horizontal bars for "top" lists (cities, categories, searches). */
export function BarList({ items, empty = 'Nothing yet.' }: { items: LabelCount[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  const max = Math.max(...items.map((i) => i.value));
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((i) => (
        <li key={i.label} className="space-y-0.5">
          <div className="flex justify-between gap-2">
            <span className="truncate">{i.label}</span>
            <span className="tabular-nums text-gray-600">{i.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
