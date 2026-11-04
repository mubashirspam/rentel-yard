/**
 * Billing configuration defaults and validation (§03.1).
 *
 * ## `minimum_days` is now a fallback, not the rule
 *
 * The floor that actually bills is **per item** — `items.minimum_days`, frozen
 * onto every ISSUE as `min_days_snapshot`, defaulting to five. A span that goes
 * out for one day costs the same as one that goes out for five, because the
 * lorry and the loading cost the same either way; items that genuinely bill by
 * the day are set to 1 on the items screen.
 *
 * This org-level number survives for exactly one job: valuing lots issued
 * before per-item minimums existed, which carry no snapshot. It stays 0 —
 * that is what those lots were billed at, and backfilling anything else would
 * rewrite history behind issued bills.
 *
 * §03.5's twelve vectors are specified against a 15-day floor and
 * `engine.test.ts` still passes that explicitly, now via the snapshot.
 */

import { LedgerError, ERROR_CODES } from '../errors';
import type { BillingConfig } from './types';

/**
 * The minimum hire period a new item starts on, and the stand-in wherever a
 * row is read that predates the column.
 *
 * Five is the yard's convention, not a law: a span that goes out for one day
 * costs the same as one that goes out for five, because the lorry, the loading
 * and the unloading cost the same either way. Items that should genuinely bill
 * by the day are set to 1 on the items screen.
 *
 * The database carries the same default so the two cannot drift; this constant
 * exists for the paths that never see a database row — a new-item form, a
 * mirrored record on a phone.
 */
export const DEFAULT_ITEM_MINIMUM_DAYS = 5;

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  day_count_mode: 'inclusive_both',
  /** Fallback for pre-snapshot lots only. See the note above. */
  minimum_days: 0,
  minimum_days_applies: 'per_issue_lot',
  rounding: 'nearest_rupee',
  damage_charge_mode: 'replacement_rate',
  accrual_stops_on_bill: false,
};

const DAY_COUNT_MODES = ['inclusive_start', 'inclusive_both'] as const;
const MINIMUM_DAYS_SCOPES = ['per_issue_lot'] as const;
const ROUNDING_MODES = ['nearest_rupee', 'none'] as const;
const DAMAGE_CHARGE_MODES = ['replacement_rate', 'manual'] as const;

/**
 * Validates a config read from `settings.billing` (which is untyped JSONB) and
 * returns it narrowed. Throws rather than silently falling back to a default:
 * a wrong `minimum_days` silently invalidates every bill the system produces.
 */
export function assertBillingConfig(config: unknown): BillingConfig {
  if (typeof config !== 'object' || config === null) {
    throw invalid('Billing settings are missing.', { config });
  }

  const candidate = config as Record<string, unknown>;

  requireOneOf(candidate, 'day_count_mode', DAY_COUNT_MODES);
  requireOneOf(candidate, 'minimum_days_applies', MINIMUM_DAYS_SCOPES);
  requireOneOf(candidate, 'rounding', ROUNDING_MODES);
  requireOneOf(candidate, 'damage_charge_mode', DAMAGE_CHARGE_MODES);

  const minimumDays = candidate.minimum_days;
  if (!Number.isInteger(minimumDays) || (minimumDays as number) < 0) {
    throw invalid('Minimum rental days must be a whole number of zero or more.', {
      field: 'minimum_days',
      value: minimumDays,
    });
  }

  if (typeof candidate.accrual_stops_on_bill !== 'boolean') {
    throw invalid('"Stop accrual on bill" must be true or false.', {
      field: 'accrual_stops_on_bill',
      value: candidate.accrual_stops_on_bill,
    });
  }

  return candidate as unknown as BillingConfig;
}

function requireOneOf(
  candidate: Record<string, unknown>,
  key: string,
  allowed: readonly string[],
): void {
  if (typeof candidate[key] !== 'string' || !allowed.includes(candidate[key] as string)) {
    throw invalid(`Billing setting "${key}" must be one of: ${allowed.join(', ')}.`, {
      field: key,
      value: candidate[key],
    });
  }
}

function invalid(message: string, context: Record<string, unknown>): LedgerError {
  const { field, ...rest } = context as { field?: string } & Record<string, unknown>;
  return new LedgerError(ERROR_CODES.INVALID_CONFIG, message, { field, context: rest });
}
