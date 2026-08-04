/**
 * Bills, payments, and adjustments (§06, §09).
 *
 * No payment gateway exists in this product: money changes hands in the yard,
 * in cash or by UPI on somebody's own phone, and these schemas describe the
 * *record* of that — not a transaction anyone can initiate here.
 */

import { z } from 'zod';

import { clientUuid, isoDate, longText, positivePaise, shortText, uuid } from './common';

export const PAYMENT_METHODS = ['cash', 'upi', 'bank', 'cheque', 'other'] as const;

/**
 * `returned` bills only lots that have come back; `all` includes open ones.
 *
 * `returned` is the default the product ships with, and this is where that
 * decision lives. A bill is for finished hire: equipment still standing on a
 * site has no final figure yet, and charging it now means the next invoice has
 * to unpick what this one already took. A site can be busy and still have a
 * load that came back last week — that load is invoiceable today, the rest
 * when it follows.
 *
 * The engine underneath stays neutral (`buildBillDraft` defaults to `all`) so
 * the arithmetic tests can pin whole runs without restating the mode.
 */
export const billScope = z.enum(['all', 'returned']);

const scopeWithDefault = billScope.default('returned');

export const previewBillSchema = z.object({
  accountId: uuid,
  periodFrom: isoDate.optional(),
  periodTo: isoDate.optional(),
  scope: scopeWithDefault,
});

export const issueBillSchema = z
  .object({
    accountId: uuid,
    periodFrom: isoDate,
    periodTo: isoDate,
    /** Omit to take `settings.payment_terms_days` from the issue date. */
    dueOn: isoDate.optional().nullable(),
    /** Defaults to `returned` — finished hire only. See `billScope`. */
    scope: scopeWithDefault,
  })
  .refine((bill) => bill.periodFrom <= bill.periodTo, {
    message: 'The period ends before it starts.',
    path: ['periodTo'],
  });

/**
 * The *input* side of the schema, so `scope` stays optional on the type.
 *
 * `z.default()` fills the value but marks it required on the output type, which
 * would force every direct caller of `issueBill` — the lifecycle tests, mainly —
 * to name a scope it does not care about. Requests coming through the route are
 * parsed first and therefore always arrive carrying one; a caller that skips the
 * boundary falls through to `buildBillDraft`'s own neutral default.
 */
export type IssueBillInput = z.input<typeof issueBillSchema>;

export const recordPaymentSchema = z.object({
  accountId: uuid,
  /** Integer paise. The form converts from rupees before it gets here. */
  amount: positivePaise,
  method: z.enum(PAYMENT_METHODS),
  paidOn: isoDate,
  /** UPI reference, cheque number, whatever the yard writes in the book. */
  reference: z.string().trim().max(80).optional().nullable(),
  remarks: longText.optional().nullable(),
  clientUuid,
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

export const addAdjustmentSchema = z.object({
  accountId: uuid,
  kind: z.enum(['charge', 'credit']),
  amount: positivePaise,
  /** Required: an adjustment with no reason is an argument waiting to happen. */
  reason: shortText,
  appliedOn: isoDate,
  clientUuid,
});

export type AddAdjustmentInput = z.infer<typeof addAdjustmentSchema>;
