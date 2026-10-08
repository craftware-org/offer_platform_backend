/**
 * India-time calendar days for analytics (ADR-0017). India has no daylight saving, so a fixed
 * +05:30 offset is exact. Days are 'YYYY-MM-DD' strings.
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** The India-time day that contains `at`. */
export function istDay(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant an India-time day starts. */
export function dayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_OFFSET_MS);
}

/** `day` moved by `delta` days. */
export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface DayRange {
  /** First day included. */
  from: string;
  /** Last day included (today for dashboards). */
  to: string;
}

/** The last `days` days ending today, and the same-length period just before it. */
export function rangeEndingToday(days: number, now: Date): { current: DayRange; previous: DayRange } {
  const to = istDay(now);
  const from = addDays(to, -(days - 1));
  return { current: { from, to }, previous: { from: addDays(from, -days), to: addDays(from, -1) } };
}

/**
 * Days from `liveFrom` on are read from raw events (the nightly rollup may not have run yet);
 * older days come from the daily totals. The rollup always rebuilds the two days before today.
 */
export function liveFrom(now: Date): string {
  return addDays(istDay(now), -1);
}
