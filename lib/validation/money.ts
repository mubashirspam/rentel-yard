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

/** `returned` bills only lots that have come back; `all` includes open ones. */
export const billScope = z.enum(['all', 'returned']);

export const previewBillSchema = z.object({
  accountId: uuid,
  periodFrom: isoDate.optional(),
  periodTo: isoDate.optional(),
  scope: billScope.optional(),
});

export const issueBillSchema = z
  .object({
    accountId: uuid,
    periodFrom: isoDate,
    periodTo: isoDate,
    /** Omit to take `settings.payment_terms_days` from the issue date. */
    dueOn: isoDate.optional().nullable(),
    /** Defaults to `all`. See `BillScope`. */
    scope: billScope.optional(),
  })
  .refine((bill) => bill.periodFrom <= bill.periodTo, {
    message: 'The period ends before it starts.',
    path: ['periodTo'],
  });

export type IssueBillInput = z.infer<typeof issueBillSchema>;

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
