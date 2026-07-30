/**
 * Recording movements — the only path that writes to the ledger.
 *
 * Two rules shape everything here:
 *
 *  1. The batch is validated by *replaying the ledger with the new rows
 *     included*, not by a shortcut check. The accrual engine is the single
 *     definition of what is legal, so the screen, the sync push, and the bill
 *     can never disagree about whether a return fits.
 *  2. It runs in a serialisable transaction. Read-then-write over the HTTP
 *     driver would let two concurrent returns both pass and drive outstanding
 *     below zero — a state that makes every later `accrue()` throw.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { accrue, type Movement } from '../accrual';
import type { StaffSession } from '../auth/guard';
import { schema, withTransaction, type Database } from '../db/client';
import { LedgerError, ERROR_CODES } from '../errors';
import type { MovementBatchInput, ReverseMovementInput } from '../validation/movements';
import { findAccount, loadBillingConfig, loadMovements } from '../accounts/repository';

export interface RecordedMovement {
  id: string;
  itemId: string;
  itemName: string;
  type: string;
  qty: number;
  movedAt: string;
  gatePassNo: string | null;
}

export interface MovementBatchResult {
  movements: RecordedMovement[];
  gatePassNo: string | null;
  /** Items whose availability is now negative — §07.4 wants an admin to see it. */
  negativeAvailability: Array<{ itemId: string; itemName: string; available: number }>;
}

/**
 * Record one gate pass: many item lines, one movement row each.
 *
 * Commits atomically (§14). A business rejection of any line rejects the whole
 * gate pass, because the paperwork the contractor signs is the batch — the
 * per-line carve-out in §07.4 belongs to the offline sync push, which reaches
 * this through a different path at M5.
 */
export async function recordMovementBatch(
  session: StaffSession,
  input: MovementBatchInput,
  today: string,
): Promise<MovementBatchResult> {
  if (input.movedAt > today) {
    throw new LedgerError(
      ERROR_CODES.INVALID_DATE,
      'That date is in the future. Rent cannot start before the equipment leaves.',
      { field: 'movedAt' },
    );
  }

  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, input.accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

    if (account.status === 'closed') {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'That account is closed. Reopen it before recording anything.',
        { field: 'accountId' },
      );
    }

    const items = await loadItems(tx, session.orgId, input.lines.map((line) => line.itemId));

    // §02: rate_snapshot is copied onto every ISSUE at creation, so a later
    // change to the master rate can never alter historical rent.
    const pending: Array<typeof schema.movements.$inferInsert> = input.lines.map((line) => {
      const item = items.get(line.itemId);
      if (!item) {
        throw new LedgerError(ERROR_CODES.NOT_FOUND, 'One of those items no longer exists.', {
          field: 'lines',
          context: { itemId: line.itemId },
        });
      }

      return {
        orgId: session.orgId,
        accountId: input.accountId,
        itemId: line.itemId,
        type: input.type,
        qty: line.qty,
        rateSnapshot: item.ratePerDay,
        replacementSnapshot: item.replacementRate,
        manualCharge: line.manualCharge ?? null,
        movedAt: input.movedAt,
        gatePassNo: input.gatePassNo ?? null,
        photoUrl: input.photoUrl ?? null,
        signatureUrl: input.signatureUrl ?? null,
        remarks: line.remarks ?? null,
        clientUuid: line.clientUuid,
        deviceId: input.deviceId ?? null,
        createdBy: session.userId,
      };
    });

    await assertBatchReplays(tx, session.orgId, input, pending, items, today);

    const inserted = await tx
      .insert(schema.movements)
      .values(pending)
      .onConflictDoNothing({ target: [schema.movements.orgId, schema.movements.clientUuid] })
      .returning({
        id: schema.movements.id,
        itemId: schema.movements.itemId,
        type: schema.movements.type,
        qty: schema.movements.qty,
        movedAt: schema.movements.movedAt,
        gatePassNo: schema.movements.gatePassNo,
      });

    return {
      movements: inserted.map((row) => ({
        ...row,
        itemName: items.get(row.itemId)?.name ?? 'Unknown item',
      })),
      gatePassNo: input.gatePassNo ?? null,
      negativeAvailability:
        input.type === 'ISSUE' ? await findNegativeAvailability(tx, session.orgId, items) : [],
    };
  });
}

/**
 * Reverse a movement (§02, §06).
 *
 * A REVERSAL is a new row carrying `reverses_id`, never an edit — the original
 * stays in the ledger so the audit trail shows what was recorded and what was
 * taken back.
 */
export async function reverseMovement(
  session: StaffSession,
  movementId: string,
  input: ReverseMovementInput,
  today: string,
): Promise<{ id: string; reversesId: string }> {
  if (input.movedAt > today) {
    throw new LedgerError(ERROR_CODES.INVALID_DATE, 'A reversal cannot be dated in the future.', {
      field: 'movedAt',
    });
  }

  return withTransaction(async (tx) => {
    const [original] = await tx
      .select({
        id: schema.movements.id,
        orgId: schema.movements.orgId,
        accountId: schema.movements.accountId,
        itemId: schema.movements.itemId,
        type: schema.movements.type,
        qty: schema.movements.qty,
        rateSnapshot: schema.movements.rateSnapshot,
        replacementSnapshot: schema.movements.replacementSnapshot,
      })
      .from(schema.movements)
      .where(
        and(eq(schema.movements.id, movementId), eq(schema.movements.orgId, session.orgId)),
      )
      .limit(1);

    if (!original) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That entry was not found.');

    if (original.type === 'REVERSAL') {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'That entry is already a reversal. Record a fresh movement instead.',
      );
    }

    const [alreadyReversed] = await tx
      .select({ id: schema.movements.id })
      .from(schema.movements)
      .where(eq(schema.movements.reversesId, movementId))
      .limit(1);

    if (alreadyReversed) {
      throw new LedgerError(ERROR_CODES.CONFLICT, 'That entry has already been reversed.');
    }

    // Reversing an ISSUE removes a lot. If returns have since consumed it, the
    // replay throws RETURN_EXCEEDS_OUTSTANDING and we refuse — otherwise the
    // account would be left in a state the engine cannot value.
    const movements = await loadMovements(tx, original.accountId);
    const config = await loadBillingConfig(tx, session.orgId);

    const reversal: Movement = {
      id: 'pending-reversal',
      itemId: original.itemId,
      type: 'REVERSAL',
      qty: original.qty,
      movedAt: input.movedAt,
      rateSnapshot: original.rateSnapshot,
      replacementSnapshot: original.replacementSnapshot,
      reversesId: original.id,
      createdAt: new Date().toISOString(),
    };

    try {
      accrue([...movements, reversal], config, today);
    } catch (error) {
      if (error instanceof LedgerError && error.code === ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING) {
        throw new LedgerError(
          ERROR_CODES.CONFLICT,
          'Returns have already been recorded against this issue. Reverse those first.',
          { context: { movementId } },
        );
      }
      throw error;
    }

    const [row] = await tx
      .insert(schema.movements)
      .values({
        orgId: session.orgId,
        accountId: original.accountId,
        itemId: original.itemId,
        type: 'REVERSAL',
        qty: original.qty,
        rateSnapshot: original.rateSnapshot,
        replacementSnapshot: original.replacementSnapshot,
        movedAt: input.movedAt,
        reversesId: original.id,
        remarks: input.reason,
        clientUuid: input.clientUuid,
        createdBy: session.userId,
      })
      .returning({ id: schema.movements.id, reversesId: schema.movements.reversesId });

    return { id: row.id, reversesId: row.reversesId as string };
  });
}

/**
 * Replay the ledger with the pending rows included.
 *
 * This is what enforces §02's "outstanding must never go below zero". The
 * engine throws `RETURN_EXCEEDS_OUTSTANDING` with the real outstanding figure,
 * which §06 requires be shown to the user as a specific, actionable message.
 */
async function assertBatchReplays(
  tx: Database,
  orgId: string,
  input: MovementBatchInput,
  pending: Array<typeof schema.movements.$inferInsert>,
  items: Map<string, { id: string; name: string }>,
  today: string,
): Promise<void> {
  const existing = await loadMovements(tx, input.accountId);
  const config = await loadBillingConfig(tx, orgId);

  const now = new Date().toISOString();
  const candidate: Movement[] = pending.map((row, index) => ({
    id: `pending-${index}`,
    itemId: row.itemId,
    type: input.type,
    qty: row.qty,
    movedAt: row.movedAt,
    rateSnapshot: row.rateSnapshot,
    replacementSnapshot: row.replacementSnapshot ?? 0,
    manualCharge: row.manualCharge ?? undefined,
    createdAt: now,
  }));

  try {
    accrue([...existing, ...candidate], config, today);
  } catch (error) {
    if (error instanceof LedgerError && error.code === ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING) {
      // Name the item, so the message reads like something a yard worker can
      // act on rather than a constraint violation.
      const itemId = error.context?.itemId as string | undefined;
      const itemName = itemId ? items.get(itemId)?.name : undefined;
      const outstanding = error.context?.outstanding as number | undefined;
      const lineIndex = pending.findIndex((row) => row.itemId === itemId);

      throw new LedgerError(
        ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING,
        itemName
          ? `Only ${outstanding} ${itemName} ${outstanding === 1 ? 'is' : 'are'} out on this account — check the quantity.`
          : error.message,
        {
          field: lineIndex >= 0 ? `lines[${lineIndex}].qty` : 'lines',
          context: error.context,
        },
      );
    }
    throw error;
  }
}

async function loadItems(tx: Database, orgId: string, itemIds: string[]) {
  const rows = await tx
    .select({
      id: schema.items.id,
      name: schema.items.name,
      ratePerDay: schema.items.ratePerDay,
      replacementRate: schema.items.replacementRate,
      isActive: schema.items.isActive,
    })
    .from(schema.items)
    .where(and(eq(schema.items.orgId, orgId), inArray(schema.items.id, itemIds)));

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * §07.4: when the ledger says more equipment is out than the yard owns, accept
 * it — it physically left — but surface it for reconciliation.
 */
async function findNegativeAvailability(
  tx: Database,
  orgId: string,
  items: Map<string, { id: string; name: string }>,
): Promise<Array<{ itemId: string; itemName: string; available: number }>> {
  const rows = await tx
    .select({
      id: schema.vItemStock.id,
      qtyAvailable: schema.vItemStock.qtyAvailable,
    })
    .from(schema.vItemStock)
    .where(
      and(
        eq(schema.vItemStock.orgId, orgId),
        inArray(schema.vItemStock.id, [...items.keys()]),
      ),
    );

  return rows
    .filter((row) => row.qtyAvailable < 0)
    .map((row) => ({
      itemId: row.id,
      itemName: items.get(row.id)?.name ?? 'Unknown item',
      available: row.qtyAvailable,
    }));
}
