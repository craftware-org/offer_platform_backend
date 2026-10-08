'use client';

import { RANGES, type RangeDays } from '@/lib/insights';

/** "7 days · 30 days · 90 days" switch for the analytics pages. */
export function RangePicker({ value, onChange }: { value: RangeDays; onChange: (days: RangeDays) => void }) {
  return (
    <fieldset className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm">
      <legend className="sr-only">Period</legend>
      {RANGES.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`px-3 py-1.5 ${value === d ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          {d} days
        </button>
      ))}
    </fieldset>
  );
}

/** A number with its change versus the previous period. */
export function StatCard({ label, value, change }: { label: string; value: number; change?: string }) {
  const tone = change?.startsWith('+') || change === 'new' ? 'text-green-700' : change?.startsWith('−') ? 'text-red-700' : 'text-gray-500';
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <p className="text-xs text-gray-600">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</p>
      {change ? <p className={`text-xs ${tone}`}>{change} vs previous period</p> : <p className="text-xs text-transparent">·</p>}
    </div>
  );
}
