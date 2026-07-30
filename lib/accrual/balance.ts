/**
 * Account balance, bill payment status, and payment allocation (§03.4).
 *
 * Pure like the rest of the engine. Balances are never stored as a mutable
 * column (§00 rule 2) — they are derived here every time from the ledger.
 */

import type { IsoDate } from './dates';
import { compareIsoDates } from './dates';
import type { AccrualResult } from './types';

export type AccountStatus = 'due' | 'advance' | 'settled';

export interface AdjustmentInput {
  id: string;
  kind: 'charge' | 'credit';
  /** Paise, always positive. Direction comes from `kind`. */
  amount: number;
  appliedOn: IsoDate;
}

export interface PaymentInput {
  id: string;
  /** Paise, always positive. */
  amount: number;
  paidOn: IsoDate;
}

export interface AccountBalance {
  rentTotal: number;
  damageTotal: number;
  chargesTotal: number;
  creditsTotal: number;
  paidTotal: number;
  /** Paise. Positive means the customer owes the yard. */
  balance: number;
  status: AccountStatus;
}

/**
 * balance = rent + damages + charges − payments − credits
 */
export function computeBalance(input: {
  accrual: Pick<AccrualResult, 'rentTotal' | 'damageTotal'>;
  adjustments?: readonly AdjustmentInput[];
  payments?: readonly PaymentInput[];
}): AccountBalance {
  const { accrual, adjustments = [], payments = [] } = input;

  let chargesTotal = 0;
  let creditsTotal = 0;
  for (const adjustment of adjustments) {
    if (adjustment.kind === 'charge') chargesTotal += adjustment.amount;
    else creditsTotal += adjustment.amount;
  }

  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = accrual.rentTotal + accrual.damageTotal + chargesTotal - paidTotal - creditsTotal;

  return {
    rentTotal: accrual.rentTotal,
    damageTotal: accrual.damageTotal,
    chargesTotal,
    creditsTotal,
    paidTotal,
    balance,
    status: balance > 0 ? 'due' : balance < 0 ? 'advance' : 'settled',
  };
}

export type BillPaymentStatus = 'paid' | 'partial' | 'pending' | 'overdue';

/**
 * Payment status shown against one bill.
 *
 * The spec's four definitions overlap: a part-paid bill past its due date
 * matches both `partial` and `overdue`. Overdue is checked first because it is
 * the one that should put the account on the reminder queue (§09).
 */
export function billPaymentStatus(input: {
  /** Paise allocated to this bill. */
  allocated: number;
  /** Paise. The bill's grand total. */
  grandTotal: number;
  dueOn: IsoDate | null;
  asOf: IsoDate;
}): BillPaymentStatus {
  const { allocated, grandTotal, dueOn, asOf } = input;

  if (allocated >= grandTotal) return 'paid';
  if (dueOn !== null && compareIsoDates(asOf, dueOn) > 0) return 'overdue';
  if (allocated > 0) return 'partial';
  return 'pending';
}

export interface AllocatableBill {
  id: string;
  grandTotal: number;
  /** Used to order bills oldest-first. */
  issuedOn: IsoDate;
}

export interface Allocation {
  paymentId: string;
  billId: string;
  /** Paise. */
  amount: number;
}

export interface AllocationResult {
  /** Rows for the `payment_allocations` table. */
  allocations: Allocation[];
  /** Paise left on each payment after every bill was covered, by payment id. */
  unallocatedByPayment: Record<string, number>;
  /** Paise still owed on each bill, by bill id. */
  outstandingByBill: Record<string, number>;
}

/**
 * Allocate payments to bills oldest-first (§03.4).
 *
 * Deterministic: bills and payments are both ordered by date then id, so the
 * same inputs always produce the same allocation rows. Any surplus stays
 * unallocated and shows up as an `advance` on the account balance.
 */
export function allocatePayments(
  payments: readonly PaymentInput[],
  bills: readonly AllocatableBill[],
): AllocationResult {
  const orderedBills = [...bills].sort(
    (a, b) => compareIsoDates(a.issuedOn, b.issuedOn) || a.id.localeCompare(b.id),
  );
  const orderedPayments = [...payments].sort(
    (a, b) => compareIsoDates(a.paidOn, b.paidOn) || a.id.localeCompare(b.id),
  );

  const remainingOnBill = new Map(orderedBills.map((bill) => [bill.id, bill.grandTotal]));
  const allocations: Allocation[] = [];
  const unallocatedByPayment: Record<string, number> = {};

  for (const payment of orderedPayments) {
    let left = payment.amount;

    for (const bill of orderedBills) {
      if (left === 0) break;
      const owed = remainingOnBill.get(bill.id) ?? 0;
      if (owed === 0) continue;

      const amount = Math.min(owed, left);
      remainingOnBill.set(bill.id, owed - amount);
      left -= amount;
      allocations.push({ paymentId: payment.id, billId: bill.id, amount });
    }

    unallocatedByPayment[payment.id] = left;
  }

  return {
    allocations,
    unallocatedByPayment,
    outstandingByBill: Object.fromEntries(remainingOnBill),
  };
}
