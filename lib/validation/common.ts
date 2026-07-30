/**
 * Shared Zod primitives (§14: schemas defined once, imported by both the client
 * form and the server handler, so the rules are identical offline and online).
 */

import { z } from 'zod';

import { isIsoDate } from '../accrual/dates';
import { tryNormaliseMobile } from '../auth/mobile';

/** A calendar date the accrual engine can consume. */
export const isoDate = z
  .string()
  .refine(isIsoDate, { message: 'Use a real date in YYYY-MM-DD form.' });

/**
 * A movement or payment date. May be back-dated freely — the yard often writes
 * up yesterday's gate passes this morning — but never set in the future (§02).
 */
export function pastOrPresentDate(today: string) {
  return isoDate.refine((value) => value <= today, {
    message: 'That date is in the future. Rent cannot start before the equipment leaves.',
  });
}

/** E.164 on the way in, so one contractor never ends up with two khatas. */
export const mobile = z.string().transform((value, ctx) => {
  const normalised = tryNormaliseMobile(value);
  if (!normalised) {
    ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit mobile number.' });
    return z.NEVER;
  }
  return normalised;
});

/** Whole units. Direction always comes from the movement type, never a sign. */
export const quantity = z
  .number()
  .int('Quantities are whole numbers.')
  .positive('Enter a quantity above zero.')
  .max(1_000_000);

/** Integer paise. §00 rule 3 — no float ever reaches the server. */
export const paise = z
  .number()
  .int('Amounts are stored in paise, as whole numbers.')
  .nonnegative();

export const positivePaise = paise.positive('Enter an amount above zero.');

export const uuid = z.uuid('That is not a valid id.');

/** Device-generated idempotency key. Makes a sync retry free (§07.2). */
export const clientUuid = z.string().min(8).max(64);

export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().max(2000);
