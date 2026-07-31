/**
 * The wire format between a device and the server (§07).
 *
 * Shared by both sides, so a change to the shape breaks the build rather than
 * a lorry-side sync at six in the evening.
 *
 * The whole protocol rests on one property of the schema: the ledger is
 * append-only, so two devices offline never write the same cell. Nobody writes
 * `stock = 42`; they write `issued 10`. Merging is a union of rows, and the
 * only real question is whether a row is legal when it lands.
 */

import { z } from 'zod';

import { isoDate } from '../validation/common';
import { movementBatchSchema, reverseMovementSchema } from '../validation/movements';
import { createCustomerSchema } from '../validation/customers';
import { openAccountSchema } from '../validation/accounts';
import { recordPaymentSchema } from '../validation/money';

/**
 * What a device may queue while offline.
 *
 * Deliberately short. §07.5: offline is required only for recording issues and
 * returns, creating a customer, opening an account, recording a payment, and
 * reading open accounts. Bills, reports, settings, and user management need a
 * connection and say so plainly.
 */
export const SYNC_OPERATIONS = [
  'movement.batch',
  'movement.reverse',
  'customer.create',
  'account.open',
  'payment.record',
] as const;

export type SyncOperation = (typeof SYNC_OPERATIONS)[number];

/**
 * One queued mutation.
 *
 * `clientUuid` is minted on the device and is the idempotency key for the whole
 * entry: pushing the same entry twice is free, because every write it performs
 * lands on a `(org_id, client_uuid)` unique index.
 */
export const syncEntrySchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('movement.batch'),
    clientUuid: z.string().min(8).max(64),
    /** The device's own clock, for ordering the queue — never for rent dates. */
    queuedAt: z.string(),
    payload: movementBatchSchema,
  }),
  z.object({
    op: z.literal('movement.reverse'),
    clientUuid: z.string().min(8).max(64),
    queuedAt: z.string(),
    payload: reverseMovementSchema.extend({ movementId: z.uuid() }),
  }),
  z.object({
    op: z.literal('customer.create'),
    clientUuid: z.string().min(8).max(64),
    queuedAt: z.string(),
    payload: createCustomerSchema,
  }),
  z.object({
    op: z.literal('account.open'),
    clientUuid: z.string().min(8).max(64),
    queuedAt: z.string(),
    payload: openAccountSchema,
  }),
  z.object({
    op: z.literal('payment.record'),
    clientUuid: z.string().min(8).max(64),
    queuedAt: z.string(),
    payload: recordPaymentSchema,
  }),
]);

export type SyncEntry = z.infer<typeof syncEntrySchema>;

export const syncPushSchema = z.object({
  deviceId: z.string().min(1).max(64),
  /** Ordered oldest first. The server applies them in the order given. */
  entries: z.array(syncEntrySchema).min(1).max(100),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;

/** What happened to one queued entry. */
export interface SyncEntryResult {
  clientUuid: string;
  op: SyncOperation;
  /**
   * - `applied`  — written, or already present from an earlier push.
   * - `rejected` — refused on business grounds (§07.4). Do not retry as-is.
   */
  status: 'applied' | 'rejected';
  /** Server ids created, so the device can rewrite its local rows. */
  ids?: Record<string, string>;
  /** Set on `rejected`: the §06 error code and a message for a yard worker. */
  code?: string;
  reason?: string;
  /**
   * Lines of a gate pass refused on their own while the rest committed (§07.4).
   * Keyed by the line's own `clientUuid`, so the device knows exactly which
   * row to move into "Needs attention".
   */
  rejectedLines?: Array<{
    clientUuid: string;
    itemId: string;
    code: string;
    reason: string;
  }>;
}

export interface SyncPushResult {
  results: SyncEntryResult[];
  /** Where the device should now pull from. */
  cursor: number;
}

export const syncPullSchema = z.object({
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});

/** Tables the device mirrors, in dependency order (§07.1). */
export const MIRRORED_TABLES = [
  'items',
  'customers',
  'accounts',
  'movements',
  'payments',
] as const;

export type MirroredTable = (typeof MIRRORED_TABLES)[number];

export interface SyncPullResult {
  /** Rows with a `server_seq` above the requested cursor, oldest first. */
  changes: Record<MirroredTable, unknown[]>;
  /** Pass this back as `cursor` next time. */
  cursor: number;
  /** True when the page was capped and another pull is due immediately. */
  hasMore: boolean;
  /** Server time, so the device can stamp "as of" honestly (§07.5). */
  serverTime: string;
}

export const bootstrapSchema = z.object({
  /** Valuation date for the balances in the payload. */
  asOf: isoDate.optional(),
});
