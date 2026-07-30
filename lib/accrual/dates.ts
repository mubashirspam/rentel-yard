/**
 * Calendar-date arithmetic on plain `YYYY-MM-DD` strings.
 *
 * Per §00 rule 4 and §14: rent is counted in whole days in Asia/Kolkata, so a
 * rent date is a calendar date and never a timestamp. A JS `Date` must never
 * reach the accrual engine — every helper here takes and returns strings.
 *
 * The engine's only "date helper" dependency (§13 M1) is this file.
 */

import { LedgerError, ERROR_CODES } from '../errors';

/** A calendar date in `YYYY-MM-DD` form. */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** True when `value` is a real calendar day written as `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  return utcDayOrNull(Number(match[1]), Number(match[2]), Number(match[3])) !== null;
}

/** Throws a `LedgerError` unless `value` is a real `YYYY-MM-DD` calendar day. */
export function assertIsoDate(value: unknown, label: string): asserts value is IsoDate {
  if (!isIsoDate(value)) {
    throw new LedgerError(
      ERROR_CODES.INVALID_DATE,
      `${label} must be a calendar date written as YYYY-MM-DD.`,
      { field: label, context: { value } },
    );
  }
}

/**
 * Days since 1970-01-01. Anchoring on UTC keeps the arithmetic free of
 * daylight-saving and local-timezone effects; the strings themselves are
 * already understood to be Asia/Kolkata calendar days.
 */
export function toEpochDay(value: IsoDate): number {
  const match = ISO_DATE.exec(value);
  const day = match && utcDayOrNull(Number(match[1]), Number(match[2]), Number(match[3]));
  if (day === null || day === undefined) {
    throw new LedgerError(ERROR_CODES.INVALID_DATE, `"${value}" is not a calendar date in YYYY-MM-DD form.`, {
      context: { value },
    });
  }
  return day;
}

/** Inverse of `toEpochDay`. */
export function fromEpochDay(epochDay: number): IsoDate {
  const date = new Date(epochDay * MS_PER_DAY);
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days from `from` to `to`. Positive when `to` is later.
 * Named to match the spec's pseudocode in §03.2.
 */
export function differenceInCalendarDays(to: IsoDate, from: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from);
}

/** `-1 | 0 | 1`, suitable for `Array.prototype.sort`. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  // Zero-padded ISO dates sort correctly as plain strings, but comparing epoch
  // days also validates both operands.
  const diff = toEpochDay(a) - toEpochDay(b);
  return diff === 0 ? 0 : diff < 0 ? -1 : 1;
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return fromEpochDay(toEpochDay(value) + days);
}

/** Returns the epoch day, or `null` when the parts are not a real date. */
function utcDayOrNull(year: number, month: number, day: number): number | null {
  const date = new Date(0);
  // setUTCFullYear (rather than Date.UTC) so two-digit years are not remapped
  // into the 1900s.
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  const roundTrips =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;

  return roundTrips ? date.getTime() / MS_PER_DAY : null;
}
