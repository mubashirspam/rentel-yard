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

import { and, eq, gte, inArray } from 'drizzle-orm';

import { accrue, type Movement } from '../accrual';
import type { StaffSession } from '../auth/guard';
import { schema, withTransaction, type Database } from '../db/client';
import { LedgerError, ERROR_CODES } from '../errors';
import type {
  AmendIssueInput,
  MovementBatchInput,
  ReverseMovementInput,
} from '../validation/movements';
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

    // §02: rate_snapshot and min_days_snapshot are copied onto every ISSUE at
    // creation, so a later change to the master rate or the item's minimum
    // hire period can never alter historical rent.
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
        minDaysSnapshot: item.minimumDays,
        manualCharge: line.manualCharge ?? null,
        movedAt: input.movedAt,
        billFrom: input.type === 'ISSUE' ? (input.billFrom ?? null) : null,
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
        minDaysSnapshot: schema.movements.minDaysSnapshot,
        billFrom: schema.movements.billFrom,
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
      minDaysSnapshot: original.minDaysSnapshot,
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
        minDaysSnapshot: original.minDaysSnapshot,
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

export interface AmendIssueResult {
  /** False when nothing differed from what was recorded. */
  changed: boolean;
  /** REVERSAL rows written, one per line taken off or replaced. */
  reversalIds: string[];
  /** The replacement ISSUE rows. */
  movementIds: string[];
}

/**
 * Correct an issue recorded wrongly: change a quantity, take a line off, or
 * fix the date, billing start or gate pass (§02).
 *
 * The ledger stays append-only. Each line that changes is reversed and
 * re-issued with the corrected values and its original rate snapshots, so a
 * rate change since the issue never reprices it. All of it commits together.
 *
 * Refused once anything has been returned against those lines, or once a bill
 * covers them — after either, the paperwork the customer holds would no
 * longer match. Use a return or a reversal then.
 */
export async function amendIssue(
  session: StaffSession,
  input: AmendIssueInput,
  today: string,
): Promise<AmendIssueResult> {
  if (input.movedAt > today) {
    throw new LedgerError(
      ERROR_CODES.INVALID_DATE,
      'That date is in the future. Rent cannot start before the equipment leaves.',
      { field: 'movedAt' },
    );
  }

  const reversalKey = (i: number) => `${input.clientUuid}:r${i}`;
  const issueKey = (i: number) => `${input.clientUuid}:n${i}`;

  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, input.accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That site was not found.');
    if (account.status === 'closed') {
      throw new LedgerError(ERROR_CODES.CONFLICT, 'That site is closed. Reopen it first.');
    }

    // Pushed twice: the first push already wrote everything.
    const keys = input.movementIds.flatMap((_, i) => [reversalKey(i), issueKey(i)]);
    const earlier = await tx
      .select({ id: schema.movements.id, type: schema.movements.type })
      .from(schema.movements)
      .where(
        and(eq(schema.movements.orgId, session.orgId), inArray(schema.movements.clientUuid, keys)),
      );
    if (earlier.length > 0) {
      return {
        changed: true,
        reversalIds: earlier.filter((m) => m.type === 'REVERSAL').map((m) => m.id),
        movementIds: earlier.filter((m) => m.type !== 'REVERSAL').map((m) => m.id),
      };
    }

    const originals = await tx
      .select()
      .from(schema.movements)
      .where(
        and(
          eq(schema.movements.orgId, session.orgId),
          eq(schema.movements.accountId, input.accountId),
          inArray(schema.movements.id, input.movementIds),
        ),
      );
    if (originals.length !== input.movementIds.length) {
      throw new LedgerError(ERROR_CODES.NOT_FOUND, 'Part of that issue was not found on this site.');
    }
    if (originals.some((m) => m.type !== 'ISSUE')) {
      throw new LedgerError(ERROR_CODES.CONFLICT, 'Only an issue can be edited this way.');
    }

    const existing = await loadMovements(tx, input.accountId);
    const reversed = new Set(
      existing.filter((m) => m.type === 'REVERSAL').map((m) => m.reversesId),
    );
    if (originals.some((m) => reversed.has(m.id))) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'Part of that issue was already reversed. Refresh and try again.',
      );
    }

    // Before billing: no bill may reach the earliest day involved.
    const earliest = [input.movedAt, ...originals.map((m) => m.movedAt)].sort()[0];
    const [bill] = await tx
      .select({ invoiceNo: schema.bills.invoiceNo })
      .from(schema.bills)
      .where(and(eq(schema.bills.accountId, input.accountId), gte(schema.bills.periodTo, earliest)))
      .limit(1);
    if (bill) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        `Bill ${bill.invoiceNo} already covers this issue, so it cannot be edited.`,
      );
    }

    // Before return: nothing may have come back out of these lots.
    const config = await loadBillingConfig(tx, session.orgId);
    const ids = new Set(input.movementIds);
    const returned = accrue(existing, config, today).lines.find(
      (line) => ids.has(line.lotId) && line.to !== null,
    );
    if (returned) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'Some of this issue has already been returned, so it cannot be edited.',
        { context: { movementId: returned.lotId } },
      );
    }

    const billFrom = input.billFrom && input.billFrom !== input.movedAt ? input.billFrom : null;
    const gatePassNo = input.gatePassNo?.trim() ? input.gatePassNo.trim() : null;
    const now = new Date().toISOString();

    const reversals: Array<typeof schema.movements.$inferInsert> = [];
    const reissues: Array<typeof schema.movements.$inferInsert> = [];

    input.movementIds.forEach((movementId, i) => {
      const original = originals.find((m) => m.id === movementId)!;
      const wanted = input.lines.find((line) => line.movementId === movementId);
      const same =
        wanted !== undefined &&
        wanted.qty === original.qty &&
        input.movedAt === original.movedAt &&
        billFrom === (original.billFrom ?? null) &&
        gatePassNo === (original.gatePassNo ?? null);
      if (same) return;

      reversals.push({
        orgId: session.orgId,
        accountId: original.accountId,
        itemId: original.itemId,
        type: 'REVERSAL',
        qty: original.qty,
        rateSnapshot: original.rateSnapshot,
        replacementSnapshot: original.replacementSnapshot,
        minDaysSnapshot: original.minDaysSnapshot,
        movedAt: today,
        reversesId: original.id,
        remarks: input.reason,
        clientUuid: reversalKey(i),
        createdBy: session.userId,
      });

      if (wanted) {
        reissues.push({
          orgId: session.orgId,
          accountId: original.accountId,
          itemId: original.itemId,
          type: 'ISSUE',
          qty: wanted.qty,
          rateSnapshot: original.rateSnapshot,
          replacementSnapshot: original.replacementSnapshot,
          minDaysSnapshot: original.minDaysSnapshot,
          manualCharge: original.manualCharge,
          movedAt: input.movedAt,
          billFrom,
          gatePassNo,
          photoUrl: original.photoUrl,
          signatureUrl: original.signatureUrl,
          remarks: original.remarks,
          clientUuid: issueKey(i),
          deviceId: original.deviceId,
          createdBy: session.userId,
        });
      }
    });

    if (reversals.length === 0) return { changed: false, reversalIds: [], movementIds: [] };

    // A later-dated issue could leave a return with nothing to come out of.
    const candidate: Movement[] = [
      ...existing,
      ...[...reversals, ...reissues].map((row, index) => ({
        id: row.type === 'REVERSAL' ? `pending-reversal-${index}` : `pending-issue-${index}`,
        itemId: row.itemId,
        type: row.type,
        qty: row.qty,
        movedAt: row.movedAt,
        rateSnapshot: row.rateSnapshot,
        replacementSnapshot: row.replacementSnapshot ?? 0,
        minDaysSnapshot: row.minDaysSnapshot ?? null,
        billFrom: row.billFrom ?? null,
        reversesId: row.reversesId ?? null,
        createdAt: now,
      })),
    ];
    try {
      accrue(candidate, config, today);
    } catch (error) {
      if (error instanceof LedgerError && error.code === ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING) {
        throw new LedgerError(
          ERROR_CODES.CONFLICT,
          'A later return would no longer fit. Check the date and quantities.',
          { context: error.context },
        );
      }
      throw error;
    }

    const reversalRows = await tx
      .insert(schema.movements)
      .values(reversals)
      .returning({ id: schema.movements.id });
    const issueRows =
      reissues.length === 0
        ? []
        : await tx.insert(schema.movements).values(reissues).returning({ id: schema.movements.id });

    return {
      changed: true,
      reversalIds: reversalRows.map((row) => row.id),
      movementIds: issueRows.map((row) => row.id),
    };
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
    minDaysSnapshot: row.minDaysSnapshot ?? null,
    billFrom: row.billFrom ?? null,
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
      minimumDays: schema.items.minimumDays,
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
