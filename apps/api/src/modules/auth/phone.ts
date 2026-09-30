import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppError } from '../../common/errors/app-error.js';

/** Normalizes user input ("98450 12345", "+91 98450-12345") to E.164 ("+919845012345"). */
export function normalizePhone(input: string, defaultCountry: string): string {
  const parsed = parsePhoneNumberFromString(input, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) throw AppError.validation({ phone: 'Invalid phone number' });
  return parsed.number;
}
