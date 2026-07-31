/**
 * Billing configuration defaults and validation (§03.1).
 *
 * `minimum_days: 0` is **the yard owner's answer**, not §03.1's number. The
 * spec proposes a 15-day minimum; the owner asked for rent to follow the days
 * actually held — issue today and one day is owed, not fifteen. It is the
 * simplest rule to explain across a counter, and it is what this yard charges.
 *
 * The engine's minimum-days machinery is untouched and still tested: §03.5's
 * twelve vectors are specified against a 15-day floor and `engine.test.ts`
 * passes that explicitly. Any yard that wants a minimum sets one in
 * `settings.billing` and the arithmetic is waiting for it.
 */

import { LedgerError, ERROR_CODES } from '../errors';
import type { BillingConfig } from './types';

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  day_count_mode: 'inclusive_start',
  /** Owner's decision: charge the days actually held. See the note above. */
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
