/** The API needs ISO-8601 instants with an explicit offset (ADR-0008); form inputs are local wall-clock times. */

const pad = (n: number) => String(n).padStart(2, '0');

/** A Date → "2026-10-01T09:00:00+05:30", in the browser's own timezone. */
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

/** Value of an <input type="datetime-local"> ("2026-10-01T09:00") → offset ISO, or null if empty/invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : toOffsetIso(date);
}

/** An ISO instant → value for <input type="datetime-local"> in the browser's timezone. */
export function isoToLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
