/**
 * Movement batches (§06 `POST /api/movements`).
 *
 * One gate pass, many item lines, one `client_uuid` per line — so a partially
 * applied sync push can reject a single line without losing the others (§07.4).
 */

import { z } from 'zod';

import { addDays } from '../accrual/dates';

import { clientUuid, isoDate, longText, paise, quantity, uuid } from './common';

/** Types a user can record directly. REVERSAL is minted by the reverse route. */
export const RECORDABLE_TYPES = ['ISSUE', 'RETURN', 'RETURN_DAMAGED', 'LOST'] as const;

export const movementLineSchema = z.object({
  itemId: uuid,
  qty: quantity,
  clientUuid,
  /** Paise per unit. Overrides the replacement rate on damage or loss. */
  manualCharge: paise.optional().nullable(),
  remarks: longText.optional().nullable(),
});

export const movementBatchSchema = z
  .object({
    accountId: uuid,
    type: z.enum(RECORDABLE_TYPES),
    movedAt: isoDate,
    /**
     * ISSUE only: the day rent starts. The issue date or the day after (an
     * evening issue billed from the next morning). Omit for the issue date.
     */
    billFrom: isoDate.optional().nullable(),
    lines: z.array(movementLineSchema).min(1, 'Add at least one item.').max(100),
    gatePassNo: z.string().trim().max(40).optional().nullable(),
    photoUrl: z.url().optional().nullable(),
    signatureUrl: z.url().optional().nullable(),
    deviceId: z.string().max(64).optional().nullable(),
  })
  .refine(
    (batch) => new Set(batch.lines.map((line) => line.clientUuid)).size === batch.lines.length,
    { message: 'Each line needs its own id.', path: ['lines'] },
  )
  .refine((batch) => new Set(batch.lines.map((line) => line.itemId)).size === batch.lines.length, {
    // Two lines for the same item on one gate pass would create two lots on the
    // same date, which is legal but always a data-entry slip. Merge them.
    message: 'That item is on the gate pass twice — combine the quantities.',
    path: ['lines'],
  })
  .refine((batch) => !batch.billFrom || batch.type === 'ISSUE', {
    message: 'Only an issue can have a billing start date.',
    path: ['billFrom'],
  })
  .refine(
    (batch) =>
      !batch.billFrom ||
      batch.billFrom === batch.movedAt ||
      batch.billFrom === addDays(batch.movedAt, 1),
    { message: 'Billing can start on the issue date or the day after.', path: ['billFrom'] },
  );

export type MovementBatchInput = z.infer<typeof movementBatchSchema>;
export type MovementLineInput = z.infer<typeof movementLineSchema>;

export const reverseMovementSchema = z.object({
  reason: z.string().trim().min(3, 'Say why this is being reversed.').max(200),
  movedAt: isoDate,
  clientUuid,
});

export type ReverseMovementInput = z.infer<typeof reverseMovementSchema>;

/**
 * Correct an issue recorded wrongly (`POST /api/movements/amend`).
 *
 * Names the issue lines being corrected and what each should be now. A line
 * left out of `lines` is taken off the issue. Only allowed before anything is
 * returned against those lines and before a bill covers them.
 */
export const amendIssueSchema = z
  .object({
    accountId: uuid,
    /** Every line of the issue being corrected, as recorded. */
    movementIds: z.array(uuid).min(1).max(100),
    /** What should stand. Empty removes the whole issue. */
    lines: z
      .array(z.object({ movementId: uuid, qty: quantity }))
      .max(100),
    movedAt: isoDate,
    billFrom: isoDate.optional().nullable(),
    gatePassNo: z.string().trim().max(40).optional().nullable(),
    reason: z.string().trim().min(3, 'Say why this is being changed.').max(200),
    clientUuid,
  })
  .refine((input) => new Set(input.movementIds).size === input.movementIds.length, {
    message: 'A line is listed twice.',
    path: ['movementIds'],
  })
  .refine((input) => input.lines.every((line) => input.movementIds.includes(line.movementId)), {
    message: 'A line does not belong to this issue.',
    path: ['lines'],
  })
  .refine((input) => new Set(input.lines.map((l) => l.movementId)).size === input.lines.length, {
    message: 'A line is listed twice.',
    path: ['lines'],
  })
  .refine(
    (input) =>
      !input.billFrom ||
      input.billFrom === input.movedAt ||
      input.billFrom === addDays(input.movedAt, 1),
    { message: 'Billing can start on the issue date or the day after.', path: ['billFrom'] },
  );

export type AmendIssueInput = z.infer<typeof amendIssueSchema>;
