/**
 * Movement batches (§06 `POST /api/movements`).
 *
 * One gate pass, many item lines, one `client_uuid` per line — so a partially
 * applied sync push can reject a single line without losing the others (§07.4).
 */

import { z } from 'zod';

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
  });

export type MovementBatchInput = z.infer<typeof movementBatchSchema>;
export type MovementLineInput = z.infer<typeof movementLineSchema>;

export const reverseMovementSchema = z.object({
  reason: z.string().trim().min(3, 'Say why this is being reversed.').max(200),
  movedAt: isoDate,
  clientUuid,
});

export type ReverseMovementInput = z.infer<typeof reverseMovementSchema>;
