/**
 * Rate-limit policy for the customer portal — pure decisions, no storage.
 *
 * The counts come from `portal_lookups` rather than an in-memory map, because
 * serverless functions do not share memory and a limiter that resets on every
 * cold start is not a limiter. Postgres is the only shared state this product
 * has, and at this volume a windowed count is a cheap indexed query.
 */

import { LedgerError, ERROR_CODES } from '../errors';

export interface RateLimitRule {
  windowMinutes: number;
  max: number;
}

/**
 * The public mobile-number lookup.
 *
 * This route is gated only on knowing a phone number, so the limits are tight:
 * they are what stops someone walking the 6–9xxxxxxxxx range to enumerate the
 * yard's customers and their dues. Per-mobile is the important one — it caps
 * how fast a single target can be probed even from many addresses.
 */
export const MOBILE_LOOKUP_LIMITS = {
  perMobile: { windowMinutes: 15, max: 5 },
  perIp: { windowMinutes: 15, max: 20 },
} as const satisfies Record<string, RateLimitRule>;

/** §05.4: 20 requests/minute per IP on `/s/[token]`. */
export const PORTAL_PAGE_LIMIT: RateLimitRule = { windowMinutes: 1, max: 20 };

export interface LookupAttemptCounts {
  /** Attempts against this mobile number within `perMobile.windowMinutes`. */
  byMobile: number;
  /** Attempts from this address within `perIp.windowMinutes`. */
  byIp: number;
}

/** Throws `RATE_LIMITED` when either limit is already spent. */
export function assertLookupAllowed(counts: LookupAttemptCounts): void {
  if (counts.byMobile >= MOBILE_LOOKUP_LIMITS.perMobile.max) {
    throw rateLimited(MOBILE_LOOKUP_LIMITS.perMobile, 'mobile');
  }
  if (counts.byIp >= MOBILE_LOOKUP_LIMITS.perIp.max) {
    throw rateLimited(MOBILE_LOOKUP_LIMITS.perIp, 'ip');
  }
}

/** The cutoff timestamp for a window, for use in a `created_at >= ?` filter. */
export function windowStart(now: Date, rule: RateLimitRule): Date {
  return new Date(now.getTime() - rule.windowMinutes * 60 * 1000);
}

function rateLimited(rule: RateLimitRule, scope: 'mobile' | 'ip'): LedgerError {
  return new LedgerError(
    ERROR_CODES.RATE_LIMITED,
    `Too many attempts. Wait ${rule.windowMinutes} minutes and try again.`,
    { context: { scope, windowMinutes: rule.windowMinutes, max: rule.max } },
  );
}
