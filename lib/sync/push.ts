/**
 * Applying a device's queued mutations (§07.2, §07.4).
 *
 * Three rules shape everything here:
 *
 *  1. **A retry is free.** Every write lands on a `(org_id, client_uuid)`
 *     unique index, so pushing the same entry twice inserts nothing the second
 *     time and still answers with the same server ids. A device that loses the
 *     response and retries must not create a second gate pass.
 *
 *  2. **One bad line does not sink the batch.** §07.4 is explicit: a return
 *     that exceeds outstanding at merge time is rejected *on its own*, and the
 *     rest of the gate pass commits. This is the one place that differs from
 *     the online path (D30), where the whole batch is atomic because the
 *     contractor signed for it as a batch. Offline, the alternative is throwing
 *     away work the yard did hours ago.
 *
 *  3. **A rejection is data, not an error.** It goes to `sync_rejections` with
 *     the payload and a message a yard worker can act on, and it comes back in
 *     the response so the device can show it in "Needs attention".
 */

import { and, eq, inArray } from 'drizzle-orm';

import { accrue, type Movement } from '../accrual';
import { findAccount, loadBillingConfig, loadMovements } from '../accounts/repository';
import { openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { syncAllocations } from '../bills/service';
import { db, schema, withTransaction, type Database } from '../db/client';
import { ERROR_CODES, isLedgerError, LedgerError } from '../errors';
import { reverseMovement } from '../movements/service';
import { recordPayment } from '../payments/service';
import type {
  SyncEntry,
  SyncEntryResult,
  SyncPushInput,
  SyncPushResult,
} from './protocol';
import { currentCursor } from './pull';

export async function applySyncPush(
  session: StaffSession,
  input: SyncPushInput,
  today: string,
): Promise<SyncPushResult> {
  const results: SyncEntryResult[] = [];

  // Sequentially, in the order the device queued them: an account.open must
  // land before the movement.batch that references it.
  for (const entry of input.entries) {
    results.push(await applyEntry(session, entry, input.deviceId, today));
  }

  return { results, cursor: await currentCursor(session) };
}

async function applyEntry(
  session: StaffSession,
  entry: SyncEntry,
  deviceId: string,
  today: string,
): Promise<SyncEntryResult> {
  try {
    switch (entry.op) {
      case 'movement.batch':
        return await applyMovementBatch(session, entry, deviceId, today);
      case 'movement.reverse':
        return await applyReversal(session, entry, today);
      case 'customer.create':
        return await applyCustomer(session, entry);
      case 'account.open':
        return await applyAccount(session, entry);
      case 'payment.record':
        return await applyPayment(session, entry, today);
    }
  } catch (error) {
    // A business rejection is the device's to resolve; anything else is ours,
    // and must not be reported as "give up on this entry".
    if (!isLedgerError(error) || error.status >= 500) throw error;

    await recordRejection(session, deviceId, entry, error.code, error.message);

    return {
      clientUuid: entry.clientUuid,
      op: entry.op,
      status: 'rejected',
      code: error.code,
      reason: error.message,
    };
  }
}

/**
 * A gate pass, line by line.
 *
 * Each line is tested against the ledger *including the lines already accepted
 * from this same batch*, so two returns of 5 against an outstanding 8 accept
 * the first and reject the second — rather than both passing a check made
 * before either was written.
 */
async function applyMovementBatch(
  session: StaffSession,
  entry: Extract<SyncEntry, { op: 'movement.batch' }>,
  deviceId: string,
  today: string,
): Promise<SyncEntryResult> {
  const { payload } = entry;

  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, payload.accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

    if (account.status === 'closed') {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'That site was closed before this reached the yard. Reopen it, or record this against another site.',
      );
    }

    const [config, existing, items] = await Promise.all([
      loadBillingConfig(tx, session.orgId),
      loadMovements(tx, payload.accountId),
      loadItems(tx, session.orgId, payload.lines.map((line) => line.itemId)),
    ]);

    const accepted: Array<typeof schema.movements.$inferInsert> = [];
    const candidates: Movement[] = [];
    const rejectedLines: NonNullable<SyncEntryResult['rejectedLines']> = [];

    for (const line of payload.lines) {
      const item = items.get(line.itemId);
      if (!item) {
        rejectedLines.push({
          clientUuid: line.clientUuid,
          itemId: line.itemId,
          code: ERROR_CODES.NOT_FOUND,
          reason: 'That item no longer exists in the yard.',
        });
        continue;
      }

      const candidate: Movement = {
        id: `pending-${line.clientUuid}`,
        itemId: line.itemId,
        type: payload.type,
        qty: line.qty,
        movedAt: payload.movedAt,
        rateSnapshot: item.ratePerDay,
        replacementSnapshot: item.replacementRate,
        manualCharge: line.manualCharge ?? undefined,
        createdAt: new Date().toISOString(),
      };

      try {
        accrue([...existing, ...candidates, candidate], config, today);
      } catch (error) {
        if (!isLedgerError(error) || error.code !== ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING) {
          throw error;
        }

        const outstanding = error.context?.outstanding as number | undefined;
        rejectedLines.push({
          clientUuid: line.clientUuid,
          itemId: line.itemId,
          code: error.code,
          reason:
            outstanding === undefined
              ? error.message
              : `Only ${outstanding} ${item.name} ${outstanding === 1 ? 'was' : 'were'} still out when this reached the yard — someone else may have recorded the return first.`,
        });
        continue;
      }

      candidates.push(candidate);
      accepted.push({
        orgId: session.orgId,
        accountId: payload.accountId,
        itemId: line.itemId,
        type: payload.type,
        qty: line.qty,
        rateSnapshot: item.ratePerDay,
        replacementSnapshot: item.replacementRate,
        manualCharge: line.manualCharge ?? null,
        movedAt: payload.movedAt,
        gatePassNo: payload.gatePassNo ?? null,
        photoUrl: payload.photoUrl ?? null,
        signatureUrl: payload.signatureUrl ?? null,
        remarks: line.remarks ?? null,
        clientUuid: line.clientUuid,
        deviceId,
        createdBy: session.userId,
      });
    }

    // Idempotent: a second push of the same lines inserts nothing.
    if (accepted.length > 0) {
      await tx
        .insert(schema.movements)
        .values(accepted)
        .onConflictDoNothing({ target: [schema.movements.orgId, schema.movements.clientUuid] });
    }

    for (const line of rejectedLines) {
      await writeRejection(tx, session.orgId, deviceId, line.clientUuid, line.reason, {
        op: entry.op,
        accountId: payload.accountId,
        type: payload.type,
        movedAt: payload.movedAt,
        itemId: line.itemId,
        qty: payload.lines.find((l) => l.clientUuid === line.clientUuid)?.qty,
      });
    }

    const ids = await idsByClientUuid(
      tx,
      session.orgId,
      payload.lines.map((line) => line.clientUuid),
    );

    return {
      clientUuid: entry.clientUuid,
      op: entry.op,
      // The entry as a whole landed; individual lines may not have.
      status: accepted.length > 0 || rejectedLines.length === 0 ? 'applied' : 'rejected',
      ids,
      rejectedLines: rejectedLines.length > 0 ? rejectedLines : undefined,
      ...(accepted.length === 0 && rejectedLines.length > 0
        ? { code: rejectedLines[0].code, reason: rejectedLines[0].reason }
        : {}),
    };
  });
}

async function applyReversal(
  session: StaffSession,
  entry: Extract<SyncEntry, { op: 'movement.reverse' }>,
  today: string,
): Promise<SyncEntryResult> {
  const { movementId, ...input } = entry.payload;

  // Already applied by an earlier push? Then this is a retry, not a conflict.
  const [existing] = await db()
    .select({ id: schema.movements.id })
    .from(schema.movements)
    .where(
      and(
        eq(schema.movements.orgId, session.orgId),
        eq(schema.movements.clientUuid, input.clientUuid),
      ),
    )
    .limit(1);

  if (existing) {
    return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: existing.id } };
  }

  const reversal = await reverseMovement(session, movementId, input, today);

  return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: reversal.id } };
}

/**
 * §07.4: two devices creating the same contractor offline merge on
 * `(org_id, mobile)`, and the device rewrites its local foreign keys to the id
 * returned here. The mobile number is the customer's identity, so this is a
 * merge rather than a conflict.
 */
async function applyCustomer(
  session: StaffSession,
  entry: Extract<SyncEntry, { op: 'customer.create' }>,
): Promise<SyncEntryResult> {
  const database = db();

  const [row] = await database
    .insert(schema.customers)
    .values({
      orgId: session.orgId,
      name: entry.payload.name,
      mobile: entry.payload.mobile,
      altMobile: entry.payload.altMobile ?? null,
      address: entry.payload.address ?? null,
      idProofUrl: entry.payload.idProofUrl ?? null,
      creditLimit: entry.payload.creditLimit,
      notes: entry.payload.notes ?? null,
    })
    .onConflictDoNothing({ target: [schema.customers.orgId, schema.customers.mobile] })
    .returning({ id: schema.customers.id });

  if (row) {
    return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: row.id } };
  }

  const [canonical] = await database
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.orgId, session.orgId),
        eq(schema.customers.mobile, entry.payload.mobile),
      ),
    )
    .limit(1);

  return {
    clientUuid: entry.clientUuid,
    op: entry.op,
    status: 'applied',
    ids: { id: canonical.id },
  };
}

async function applyAccount(
  session: StaffSession,
  entry: Extract<SyncEntry, { op: 'account.open' }>,
): Promise<SyncEntryResult> {
  const database = db();

  const [existing] = await database
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.orgId, session.orgId),
        eq(schema.accounts.clientUuid, entry.clientUuid),
      ),
    )
    .limit(1);

  if (existing) {
    return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: existing.id } };
  }

  const account = await openAccount(session, entry.payload, entry.clientUuid);

  return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: account.id } };
}

async function applyPayment(
  session: StaffSession,
  entry: Extract<SyncEntry, { op: 'payment.record' }>,
  today: string,
): Promise<SyncEntryResult> {
  const [existing] = await db()
    .select({ id: schema.payments.id })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.orgId, session.orgId),
        eq(schema.payments.clientUuid, entry.payload.clientUuid),
      ),
    )
    .limit(1);

  if (existing) {
    // A retry. Re-run allocation anyway: bills issued since the first push may
    // have changed which invoice this money settles.
    await withTransaction((tx) => syncAllocations(tx, entry.payload.accountId));
    return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: existing.id } };
  }

  const { payment } = await recordPayment(session, entry.payload, today);

  return { clientUuid: entry.clientUuid, op: entry.op, status: 'applied', ids: { id: payment.id } };
}

// ------------------------------------------------------------- internals --

async function loadItems(tx: Database, orgId: string, itemIds: string[]) {
  const rows = await tx
    .select({
      id: schema.items.id,
      name: schema.items.name,
      ratePerDay: schema.items.ratePerDay,
      replacementRate: schema.items.replacementRate,
    })
    .from(schema.items)
    .where(and(eq(schema.items.orgId, orgId), inArray(schema.items.id, itemIds)));

  return new Map(rows.map((row) => [row.id, row]));
}

async function idsByClientUuid(
  tx: Database,
  orgId: string,
  clientUuids: string[],
): Promise<Record<string, string>> {
  const rows = await tx
    .select({ id: schema.movements.id, clientUuid: schema.movements.clientUuid })
    .from(schema.movements)
    .where(
      and(eq(schema.movements.orgId, orgId), inArray(schema.movements.clientUuid, clientUuids)),
    );

  return Object.fromEntries(rows.map((row) => [row.clientUuid, row.id]));
}

async function recordRejection(
  session: StaffSession,
  deviceId: string,
  entry: SyncEntry,
  code: string,
  reason: string,
): Promise<void> {
  await writeRejection(db(), session.orgId, deviceId, entry.clientUuid, reason, {
    op: entry.op,
    code,
    payload: entry.payload,
  });
}

/**
 * One row per refusal, so "Needs attention" survives a browser restart and an
 * admin can see what the yard tried to record even from another device.
 */
async function writeRejection(
  tx: Database,
  orgId: string,
  deviceId: string,
  clientUuid: string,
  reason: string,
  payload: unknown,
): Promise<void> {
  await tx
    .insert(schema.syncRejections)
    .values({ orgId, clientUuid, deviceId, payload, reason });
}
