/**
 * Mobile numbers, normalised to E.164 (§04 `customers.mobile`).
 *
 * The number is the customer's identity: it is the unique key on the customer
 * record and, per the build decision, the credential for the public lookup
 * page. So "9846 012345", "+919846012345" and "09846012345" must all resolve
 * to one canonical string, or the same contractor gets two khatas.
 *
 * Pure — no I/O, safe to share with the offline client.
 */

import { LedgerError, ERROR_CODES } from '../errors';

/** India. The only country the product ships to (§01). */
const DEFAULT_COUNTRY_CODE = '91';
const INDIAN_MOBILE = /^[6-9]\d{9}$/;
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalise user input to E.164, or throw.
 *
 * Accepts: `9846012345`, `09846012345`, `+91 98460 12345`, `91-9846012345`.
 */
export function normaliseMobile(input: string): string {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw invalid('Enter a mobile number.', input);
  }

  // Keep a leading +, drop spaces, dashes, brackets, and dots.
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/[^\d]/g, '');

  if (digits === '') throw invalid('A mobile number must contain digits.', input);

  let candidate: string;

  if (hasPlus) {
    candidate = `+${digits}`;
  } else if (digits.length === 10 && INDIAN_MOBILE.test(digits)) {
    candidate = `+${DEFAULT_COUNTRY_CODE}${digits}`;
  } else if (digits.length === 11 && digits.startsWith('0') && INDIAN_MOBILE.test(digits.slice(1))) {
    candidate = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    candidate = `+${digits}`;
  } else {
    throw invalid('That does not look like a mobile number. Enter 10 digits.', input);
  }

  if (!E164.test(candidate)) {
    throw invalid('That does not look like a mobile number. Enter 10 digits.', input);
  }

  return candidate;
}

/** Non-throwing variant, for filtering a CSV import without try/catch noise. */
export function tryNormaliseMobile(input: string): string | null {
  try {
    return normaliseMobile(input);
  } catch {
    return null;
  }
}

/** `+919846012345` → `98460 12345`, for display next to a tap-to-call link. */
export function formatMobile(e164: string): string {
  const indian = e164.startsWith(`+${DEFAULT_COUNTRY_CODE}`) && e164.length === 13;
  if (!indian) return e164;

  const local = e164.slice(3);
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

/** The bare digits wa.me expects: no `+`, no spaces. */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/^\+/, '');
}

function invalid(message: string, input: string): LedgerError {
  return new LedgerError(ERROR_CODES.INVALID_MOBILE, message, {
    field: 'mobile',
    context: { input },
  });
}
