import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { AppError } from '../errors/app-error.js';

/**
 * Normalizes user input ("98450 12345", "+91 98450-12345") to E.164 ("+919845012345").
 * `field` names the input in the validation error (e.g. "whatsapp").
 */
export function normalizePhone(input: string, defaultCountry: string, field = 'phone'): string {
  const parsed = parsePhoneNumberFromString(input, defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) throw AppError.validation({ [field]: 'Invalid phone number' });
  return parsed.number;
}
