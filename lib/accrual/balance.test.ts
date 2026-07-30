import { describe, expect, it } from 'vitest';

import { rupeesToPaise } from '../money';
import { allocatePayments, billPaymentStatus, computeBalance } from './balance';

const rupees = (amount: string | number) => rupeesToPaise(amount);

describe('computeBalance', () => {
  const accrual = { rentTotal: rupees(12_400), damageTotal: rupees(1_800) };

  it('adds charges and subtracts payments and credits', () => {
    // The §09 sample bill: ₹12,400 rent + ₹1,800 damages + ₹1,500 transport,
    // less ₹10,000 received.
    const balance = computeBalance({
      accrual,
      adjustments: [{ id: 'a1', kind: 'charge', amount: rupees(1_500), appliedOn: '2026-06-30' }],
      payments: [{ id: 'p1', amount: rupees(10_000), paidOn: '2026-06-20' }],
    });

    expect(balance.chargesTotal).toBe(rupees(1_500));
    expect(balance.balance).toBe(rupees(5_700));
    expect(balance.status).toBe('due');
  });

  it('reports an advance when the customer has overpaid', () => {
    const balance = computeBalance({
      accrual: { rentTotal: rupees(1_000), damageTotal: 0 },
      payments: [{ id: 'p1', amount: rupees(1_500), paidOn: '2026-06-20' }],
    });

    expect(balance.balance).toBe(rupees(-500));
    expect(balance.status).toBe('advance');
  });

  it('reports settled at exactly zero', () => {
    const balance = computeBalance({
      accrual: { rentTotal: rupees(1_000), damageTotal: 0 },
      payments: [{ id: 'p1', amount: rupees(1_000), paidOn: '2026-06-20' }],
    });

    expect(balance.status).toBe('settled');
  });

  it('treats a credit adjustment as a reduction, not a charge', () => {
    const balance = computeBalance({
      accrual: { rentTotal: rupees(1_000), damageTotal: 0 },
      adjustments: [{ id: 'a1', kind: 'credit', amount: rupees(250), appliedOn: '2026-06-30' }],
    });

    expect(balance.creditsTotal).toBe(rupees(250));
    expect(balance.balance).toBe(rupees(750));
  });

  it('handles an account with nothing on it', () => {
    const balance = computeBalance({ accrual: { rentTotal: 0, damageTotal: 0 } });
    expect(balance).toMatchObject({ balance: 0, status: 'settled', paidTotal: 0 });
  });
});

describe('billPaymentStatus', () => {
  const base = { grandTotal: rupees(1_000), dueOn: '2026-07-15', asOf: '2026-07-10' };

  it('is paid once the allocation covers the total', () => {
    expect(billPaymentStatus({ ...base, allocated: rupees(1_000) })).toBe('paid');
    expect(billPaymentStatus({ ...base, allocated: rupees(1_200) })).toBe('paid');
  });

  it('is pending before the due date with nothing paid', () => {
    expect(billPaymentStatus({ ...base, allocated: 0 })).toBe('pending');
  });

  it('is partial before the due date with something paid', () => {
    expect(billPaymentStatus({ ...base, allocated: rupees(400) })).toBe('partial');
  });

  it('is overdue past the due date, part-paid or not', () => {
    const late = { ...base, asOf: '2026-07-16' };
    expect(billPaymentStatus({ ...late, allocated: 0 })).toBe('overdue');
    expect(billPaymentStatus({ ...late, allocated: rupees(400) })).toBe('overdue');
  });

  it('is never overdue when no due date was set', () => {
    expect(billPaymentStatus({ ...base, dueOn: null, asOf: '2030-01-01', allocated: 0 })).toBe('pending');
  });

  it('is paid on the due date itself, not overdue', () => {
    expect(billPaymentStatus({ ...base, asOf: '2026-07-15', allocated: 0 })).toBe('pending');
  });
});

describe('allocatePayments', () => {
  const bills = [
    { id: 'bill-jun', grandTotal: rupees(5_000), issuedOn: '2026-06-30' },
    { id: 'bill-jul', grandTotal: rupees(3_000), issuedOn: '2026-07-31' },
  ];

  it('fills the oldest bill first and spills into the next', () => {
    const result = allocatePayments([{ id: 'p1', amount: rupees(6_000), paidOn: '2026-08-01' }], bills);

    expect(result.allocations).toEqual([
      { paymentId: 'p1', billId: 'bill-jun', amount: rupees(5_000) },
      { paymentId: 'p1', billId: 'bill-jul', amount: rupees(1_000) },
    ]);
    expect(result.outstandingByBill).toEqual({ 'bill-jun': 0, 'bill-jul': rupees(2_000) });
    expect(result.unallocatedByPayment).toEqual({ p1: 0 });
  });

  it('leaves a surplus unallocated rather than inventing a bill', () => {
    const result = allocatePayments([{ id: 'p1', amount: rupees(10_000), paidOn: '2026-08-01' }], bills);

    expect(result.unallocatedByPayment.p1).toBe(rupees(2_000));
    expect(result.outstandingByBill).toEqual({ 'bill-jun': 0, 'bill-jul': 0 });
  });

  it('applies several payments in date order', () => {
    const result = allocatePayments(
      [
        { id: 'p2', amount: rupees(4_000), paidOn: '2026-08-05' },
        { id: 'p1', amount: rupees(2_000), paidOn: '2026-07-05' },
      ],
      bills,
    );

    expect(result.allocations).toEqual([
      { paymentId: 'p1', billId: 'bill-jun', amount: rupees(2_000) },
      { paymentId: 'p2', billId: 'bill-jun', amount: rupees(3_000) },
      { paymentId: 'p2', billId: 'bill-jul', amount: rupees(1_000) },
    ]);
  });

  it('is deterministic regardless of input order', () => {
    const payments = [
      { id: 'p1', amount: rupees(2_000), paidOn: '2026-07-05' },
      { id: 'p2', amount: rupees(4_000), paidOn: '2026-08-05' },
    ];

    expect(allocatePayments([...payments].reverse(), [...bills].reverse())).toEqual(
      allocatePayments(payments, bills),
    );
  });

  it('does nothing when there are no bills yet', () => {
    const result = allocatePayments([{ id: 'p1', amount: rupees(500), paidOn: '2026-08-01' }], []);

    expect(result.allocations).toEqual([]);
    expect(result.unallocatedByPayment).toEqual({ p1: rupees(500) });
  });
});
