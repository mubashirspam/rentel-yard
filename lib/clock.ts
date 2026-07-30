/**
 * "Today" in the yard's timezone.
 *
 * Rent is counted in whole days in Asia/Kolkata (§00 rule 4). A server in UTC
 * rolls over five and a half hours early, so between 18:30 and midnight IST it
 * would date a gate pass tomorrow — and §02 forbids a future `moved_at`. This
 * is the only place the current date is derived.
 */

import type { IsoDate } from './accrual/dates';

export const YARD_TIMEZONE = 'Asia/Kolkata';

const FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: YARD_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's calendar date in the yard, as `YYYY-MM-DD`. */
export function today(now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape the engine wants.
  return FORMATTER.format(now);
}
