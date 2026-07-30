/**
 * The rent accrual engine (§03).
 *
 * Pure and dependency-free. Nothing in here may import a database client, a
 * Next.js primitive, or anything that touches the network.
 */

export * from './types';
export * from './dates';
export { DEFAULT_BILLING_CONFIG, assertBillingConfig } from './config';
export { roundLineTotal } from './rounding';
export { accrue, dayCount, outstandingFor, isAccountEmpty } from './engine';
export {
  computeBalance,
  billPaymentStatus,
  allocatePayments,
  type AccountStatus,
  type AccountBalance,
  type AdjustmentInput,
  type PaymentInput,
  type BillPaymentStatus,
  type AllocatableBill,
  type Allocation,
  type AllocationResult,
} from './balance';
