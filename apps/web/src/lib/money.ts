/** Money is integer paise everywhere (ADR-0008). Forms take rupees; these convert exactly, without floats. */

const RUPEES = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/;

/** "1,999.50" style input → 199950 paise. Returns null for empty or invalid input. */
export function rupeesToPaise(input: string): number | null {
  const match = RUPEES.exec(input.replaceAll(',', ''));
  if (!match) return null;
  const [, whole, fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 199950 → "1999.5" (for pre-filling a form field). */
export function paiseToRupeesInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const whole = Math.floor(paise / 100);
  const fraction = paise % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** 199950 → "₹1,999.50"; whole rupees drop the decimals: 199900 → "₹1,999". */
export function formatInr(paise: number): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100);
}
