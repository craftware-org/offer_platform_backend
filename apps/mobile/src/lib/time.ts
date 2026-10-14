/** The API needs ISO-8601 instants with an explicit offset (ADR-0008). Same rules as apps/web/src/lib/time.ts. */

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date → "2026-10-01T09:00:00+05:30", in the phone's own timezone. */
export function toOffsetIso(date: Date): string {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** "Ends in 3 days" / "Ends in 5 hours" / "Ended". */
export function endsIn(expiresAt: string, now = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'Ended';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'Ends within an hour';
  if (hours < 48) return `Ends in ${hours} hour${hours === 1 ? '' : 's'}`;
  return `Ends in ${Math.floor(hours / 24)} days`;
}

export function formatDateTime(iso: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeStyle: 'short' }).format(date);
}

/** Keeps the calendar day of `day` and the clock time of `time`. */
export function combineDayAndTime(day: Date, time: Date): Date {
  const d = new Date(day);
  d.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return d;
}
