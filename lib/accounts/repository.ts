/**
 * The bridge between stored rows and the pure accrual engine.
 *
 * The engine knows nothing about the database (§03). This is the only place
 * that maps one onto the other, so there is exactly one definition of "the
 * movements that count" and it cannot drift between the account screen, the
 * bill generator, and the reports.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import type { Movement } from '../accrual';
import { assertBillingConfig, DEFAULT_BILLING_CONFIG, type BillingConfig } from '../accrual';
import { type Database, schema } from '../db/client';

/**
 * Load every movement on an account, shaped for `accrue()`.
 *
 * REVERSAL rows are included, not filtered: the engine needs them in order to
 * drop what they cancel. Ordering is by (movedAt, createdAt) so a back-dated
 * entry slots into place by its movement date (§03.5 vector 11).
 */
export async function loadMovements(db: Database, accountId: string): Promise<Movement[]> {
  const rows = await db
    .select({
      id: schema.movements.id,
      itemId: schema.movements.itemId,
      type: schema.movements.type,
      qty: schema.movements.qty,
      movedAt: schema.movements.movedAt,
      rateSnapshot: schema.movements.rateSnapshot,
      replacementSnapshot: schema.movements.replacementSnapshot,
      manualCharge: schema.movements.manualCharge,
      reversesId: schema.movements.reversesId,
      createdAt: schema.movements.createdAt,
    })
    .from(schema.movements)
    .where(eq(schema.movements.accountId, accountId))
    .orderBy(asc(schema.movements.movedAt), asc(schema.movements.createdAt));

  return rows.map((row) => ({
    id: row.id,
    itemId: row.itemId,
    type: row.type,
    qty: row.qty,
    movedAt: row.movedAt,
    rateSnapshot: row.rateSnapshot,
    replacementSnapshot: row.replacementSnapshot,
    manualCharge: row.manualCharge ?? undefined,
    reversesId: row.reversesId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/**
 * The org's billing configuration.
 *
 * Falls back to the §03.1 defaults when settings are absent, because a yard
 * that has not opened the settings screen still needs working arithmetic.
 * Never read from a global — this is passed into the engine as an argument.
 */
export async function loadBillingConfig(db: Database, orgId: string): Promise<BillingConfig> {
  const [row] = await db
    .select({ billing: schema.settings.billing })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, orgId))
    .limit(1);

  if (!row?.billing) return DEFAULT_BILLING_CONFIG;
  return assertBillingConfig(row.billing);
}

export interface AccountRow {
  id: string;
  orgId: string;
  customerId: string;
  siteName: string;
  siteAddress: string | null;
  status: 'open' | 'closed';
  openedOn: string;
  closedOn: string | null;
}

/** Fetch an account scoped to the caller's org. Absent and foreign look alike. */
export async function findAccount(
  db: Database,
  orgId: string,
  accountId: string,
): Promise<AccountRow | null> {
  const [row] = await db
    .select({
      id: schema.accounts.id,
      orgId: schema.accounts.orgId,
      customerId: schema.accounts.customerId,
      siteName: schema.accounts.siteName,
      siteAddress: schema.accounts.siteAddress,
      status: schema.accounts.status,
      openedOn: schema.accounts.openedOn,
      closedOn: schema.accounts.closedOn,
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.orgId, orgId)))
    .limit(1);

  return row ?? null;
}

/** Payments on an account, shaped for `computeBalance`. */
export async function loadPayments(db: Database, accountId: string) {
  return db
    .select({
      id: schema.payments.id,
      amount: schema.payments.amount,
      paidOn: schema.payments.paidOn,
      method: schema.payments.method,
      reference: schema.payments.reference,
    })
    .from(schema.payments)
    .where(eq(schema.payments.accountId, accountId))
    .orderBy(asc(schema.payments.paidOn));
}

/** Adjustments on an account, shaped for `computeBalance`. */
export async function loadAdjustments(db: Database, accountId: string) {
  return db
    .select({
      id: schema.adjustments.id,
      kind: schema.adjustments.kind,
      amount: schema.adjustments.amount,
      reason: schema.adjustments.reason,
      appliedOn: schema.adjustments.appliedOn,
    })
    .from(schema.adjustments)
    .where(eq(schema.adjustments.accountId, accountId))
    .orderBy(asc(schema.adjustments.appliedOn));
}

export type PaymentRow = Awaited<ReturnType<typeof loadPayments>>[number];
export type AdjustmentRow = Awaited<ReturnType<typeof loadAdjustments>>[number];

export interface AccountLedger {
  movements: Movement[];
  payments: PaymentRow[];
  adjustments: AdjustmentRow[];
}

/**
 * Every ledger for a set of accounts, in three queries rather than three per
 * account.
 *
 * A list screen values each account by replaying it, so the per-account loaders
 * turn a twenty-account list into sixty round trips — and Neon charges by the
 * round trip. Accounts with no rows still get an entry, so callers never have
 * to guard for a missing key.
 */
export async function loadLedgers(
  db: Database,
  accountIds: readonly string[],
): Promise<Map<string, AccountLedger>> {
  const ledgers = new Map<string, AccountLedger>(
    accountIds.map((id) => [id, { movements: [], payments: [], adjustments: [] }]),
  );

  if (accountIds.length === 0) return ledgers;
  const ids = [...accountIds];

  const [movementRows, paymentRows, adjustmentRows] = await Promise.all([
    db
      .select({
        accountId: schema.movements.accountId,
        id: schema.movements.id,
        itemId: schema.movements.itemId,
        type: schema.movements.type,
        qty: schema.movements.qty,
        movedAt: schema.movements.movedAt,
        rateSnapshot: schema.movements.rateSnapshot,
        replacementSnapshot: schema.movements.replacementSnapshot,
        manualCharge: schema.movements.manualCharge,
        reversesId: schema.movements.reversesId,
        createdAt: schema.movements.createdAt,
      })
      .from(schema.movements)
      .where(inArray(schema.movements.accountId, ids))
      .orderBy(asc(schema.movements.movedAt), asc(schema.movements.createdAt)),
    db
      .select({
        accountId: schema.payments.accountId,
        id: schema.payments.id,
        amount: schema.payments.amount,
        paidOn: schema.payments.paidOn,
        method: schema.payments.method,
        reference: schema.payments.reference,
      })
      .from(schema.payments)
      .where(inArray(schema.payments.accountId, ids))
      .orderBy(asc(schema.payments.paidOn)),
    db
      .select({
        accountId: schema.adjustments.accountId,
        id: schema.adjustments.id,
        kind: schema.adjustments.kind,
        amount: schema.adjustments.amount,
        reason: schema.adjustments.reason,
        appliedOn: schema.adjustments.appliedOn,
      })
      .from(schema.adjustments)
      .where(inArray(schema.adjustments.accountId, ids))
      .orderBy(asc(schema.adjustments.appliedOn)),
  ]);

  for (const { accountId, ...row } of movementRows) {
    ledgers.get(accountId)?.movements.push({
      ...row,
      manualCharge: row.manualCharge ?? undefined,
      createdAt: row.createdAt.toISOString(),
    });
  }
  for (const { accountId, ...row } of paymentRows) {
    ledgers.get(accountId)?.payments.push(row);
  }
  for (const { accountId, ...row } of adjustmentRows) {
    ledgers.get(accountId)?.adjustments.push(row);
  }

  return ledgers;
}
