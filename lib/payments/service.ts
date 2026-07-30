/**
 * Payments and adjustments (§03.4, §09).
 *
 * **Nothing is collected here.** There is no gateway, no UPI intent, no card
 * anything — money changes hands in the yard, and this records that it did.
 * A payment row is a receipt written into the ledger, and the only automation
 * around it is deciding which bills it settles.
 *
 * That allocation is oldest bill first, always, so an admin never has to choose
 * and two admins never choose differently.
 */

import { and, desc, eq } from 'drizzle-orm';

import { accrue, computeBalance } from '../accrual';
import {
  findAccount,
  loadAdjustments,
  loadBillingConfig,
  loadMovements,
  loadPayments,
} from '../accounts/repository';
import type { StaffSession } from '../auth/guard';
import { syncAllocations } from '../bills/service';
import { db, schema, withTransaction } from '../db/client';
import { ERROR_CODES, LedgerError } from '../errors';
import type { AddAdjustmentInput, RecordPaymentInput } from '../validation/money';

export interface PaymentRecord {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  paidOn: string;
  remarks: string | null;
  by: string | null;
}

export interface MoneySummary {
  /** Paise the account owes in total, billed or not (§03.4). */
  balance: number;
  /** Paise frozen into bills so far. */
  billedTotal: number;
  /** Paise received, ever. */
  paidTotal: number;
  /** Paise still owed on issued bills. */
  pendingOnBills: number;
  /**
   * Paise accrued but not yet on any bill. Derived — it is what is left of the
   * balance once the issued bills are accounted for.
   */
  unbilled: number;
}

/**
 * Record money received.
 *
 * Allowed on a closed account: closing a site means the equipment came back,
 * not that the bill was paid.
 */
export async function recordPayment(
  session: StaffSession,
  input: RecordPaymentInput,
  today: string,
): Promise<{ payment: PaymentRecord; allocatedToBills: number; unallocated: number }> {
  if (input.paidOn > today) {
    throw new LedgerError(ERROR_CODES.INVALID_DATE, 'That date is in the future.', {
      field: 'paidOn',
    });
  }

  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, input.accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

    const [row] = await tx
      .insert(schema.payments)
      .values({
        orgId: session.orgId,
        accountId: input.accountId,
        amount: input.amount,
        method: input.method,
        reference: input.reference ?? null,
        paidOn: input.paidOn,
        remarks: input.remarks ?? null,
        clientUuid: input.clientUuid,
        createdBy: session.userId,
      })
      // §07.2: the same receipt pushed twice is the same row, not two.
      .onConflictDoNothing({ target: [schema.payments.orgId, schema.payments.clientUuid] })
      .returning();

    if (!row) {
      throw new LedgerError(ERROR_CODES.CONFLICT, 'That payment has already been recorded.', {
        context: { clientUuid: input.clientUuid },
      });
    }

    await syncAllocations(tx, input.accountId);

    const [allocated] = await tx
      .select({ amount: schema.paymentAllocations.amount })
      .from(schema.paymentAllocations)
      .where(eq(schema.paymentAllocations.paymentId, row.id));

    const allocatedToBills = allocated?.amount ?? 0;

    return {
      payment: {
        id: row.id,
        amount: row.amount,
        method: row.method,
        reference: row.reference,
        paidOn: row.paidOn,
        remarks: row.remarks,
        by: session.name,
      },
      allocatedToBills,
      // Money beyond what is billed sits as an advance until the next bill.
      unallocated: row.amount - allocatedToBills,
    };
  });
}

export async function listPayments(
  session: StaffSession,
  accountId: string,
): Promise<PaymentRecord[]> {
  return db()
    .select({
      id: schema.payments.id,
      amount: schema.payments.amount,
      method: schema.payments.method,
      reference: schema.payments.reference,
      paidOn: schema.payments.paidOn,
      remarks: schema.payments.remarks,
      by: schema.users.name,
    })
    .from(schema.payments)
    .leftJoin(schema.users, eq(schema.users.id, schema.payments.createdBy))
    .where(
      and(eq(schema.payments.orgId, session.orgId), eq(schema.payments.accountId, accountId)),
    )
    .orderBy(desc(schema.payments.paidOn));
}

/**
 * A charge or credit outside the rent calculation — transport, a negotiated
 * write-off, a correction to a bill that can no longer be edited (§09).
 */
export async function addAdjustment(
  session: StaffSession,
  input: AddAdjustmentInput,
  today: string,
) {
  if (input.appliedOn > today) {
    throw new LedgerError(ERROR_CODES.INVALID_DATE, 'That date is in the future.', {
      field: 'appliedOn',
    });
  }

  const account = await findAccount(db(), session.orgId, input.accountId);
  if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

  const [row] = await db()
    .insert(schema.adjustments)
    .values({
      orgId: session.orgId,
      accountId: input.accountId,
      kind: input.kind,
      amount: input.amount,
      reason: input.reason,
      appliedOn: input.appliedOn,
      clientUuid: input.clientUuid,
      createdBy: session.userId,
    })
    .onConflictDoNothing({ target: [schema.adjustments.orgId, schema.adjustments.clientUuid] })
    .returning();

  if (!row) {
    throw new LedgerError(ERROR_CODES.CONFLICT, 'That adjustment has already been recorded.');
  }

  return row;
}

/** The money picture for one account: billed, paid, pending, and unbilled. */
export async function getMoneySummary(
  session: StaffSession,
  accountId: string,
  asOf: string,
): Promise<MoneySummary> {
  const database = db();

  const [config, movements, payments, adjustments, bills, allocations] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadMovements(database, accountId),
    loadPayments(database, accountId),
    loadAdjustments(database, accountId),
    database
      .select({ id: schema.bills.id, grandTotal: schema.bills.grandTotal })
      .from(schema.bills)
      .where(eq(schema.bills.accountId, accountId)),
    database
      .select({
        billId: schema.paymentAllocations.billId,
        amount: schema.paymentAllocations.amount,
      })
      .from(schema.paymentAllocations)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAllocations.paymentId))
      .where(eq(schema.payments.accountId, accountId)),
  ]);

  const accrual = accrue(movements, config, asOf);
  const balance = computeBalance({ accrual, adjustments, payments }).balance;

  const billedTotal = bills.reduce((sum, bill) => sum + bill.grandTotal, 0);
  const allocatedTotal = allocations.reduce((sum, row) => sum + row.amount, 0);
  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingOnBills = billedTotal - allocatedTotal;

  return {
    balance,
    billedTotal,
    paidTotal,
    pendingOnBills,
    unbilled: balance - pendingOnBills,
  };
}
