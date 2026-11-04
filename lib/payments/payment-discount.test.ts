/**
 * A discount given when the money is taken, end to end against a real Postgres.
 *
 * Bill ₹400, customer pays ₹350, the yard lets ₹50 go: the bill is paid, the
 * account is square, ₹350 counts as received, and the ₹50 does not come off
 * the next bill as well.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAccountDetail, openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { getBill, issueBill, previewBill } from '../bills/service';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { recordMovementBatch } from '../movements/service';
import { recordPaymentSchema } from '../validation/money';
import { getMoneySummary, recordPayment } from './service';

const RATE = 10_000; // ₹100 per unit per day
const ISSUED = '2026-11-03';
const NEXT_DAY = '2026-11-04';
const DAY_AFTER = '2026-11-05';

let db: TestDatabase;
let session: StaffSession;
let customerId: string;
let itemId: string;

let uuidCounter = 0;
const nextUuid = () => `pay-discount-${String((uuidCounter += 1)).padStart(4, '0')}`;

async function siteWithBill(name: string) {
  const account = await openAccount(session, { customerId, siteName: name, openedOn: ISSUED });
  await recordMovementBatch(
    session,
    {
      accountId: account.id,
      type: 'ISSUE',
      movedAt: ISSUED,
      lines: [{ itemId, qty: 2, clientUuid: nextUuid() }],
    },
    ISSUED,
  );
  // 2 units × ₹100 × 2 days = ₹400
  const bill = await issueBill(
    session,
    { accountId: account.id, periodFrom: ISSUED, periodTo: NEXT_DAY, scope: 'all' },
    NEXT_DAY,
  );
  return { accountId: account.id, billId: bill.id };
}

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Discount Yard') returning id`,
  );
  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@discount.test', 'Yard Owner', 'super_admin') returning id`,
    [org.id],
  );
  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Muneer', '+919961138983')
     returning id`,
    [org.id],
  );
  customerId = customer.id;
  const [item] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned, minimum_days)
     values ($1, 'Scaffold', 'SCF', $2, 0, 100, 1) returning id`,
    [org.id, RATE],
  );
  itemId = item.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@discount.test',
    name: 'Yard Owner',
  };
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('a discount given with a payment', () => {
  let accountId: string;
  let billId: string;

  beforeAll(async () => {
    ({ accountId, billId } = await siteWithBill('Pay with discount'));
    await recordPayment(
      session,
      {
        accountId,
        amount: 35_000,
        discount: 5_000,
        method: 'cash',
        paidOn: NEXT_DAY,
        clientUuid: nextUuid(),
      },
      NEXT_DAY,
    );
  });

  it('marks the bill paid', async () => {
    const bill = await getBill(session, billId, NEXT_DAY);
    expect(bill.status).toBe('paid');
  });

  it('squares the account, but counts only the money as received', async () => {
    const money = await getMoneySummary(session, accountId, NEXT_DAY);
    expect(money.balance).toBe(0);
    expect(money.pendingOnBills).toBe(0);
    expect(money.paidTotal).toBe(35_000);
  });

  it('does not come off the next bill as well', async () => {
    const preview = await previewBill(
      session,
      accountId,
      { periodTo: DAY_AFTER, scope: 'all' },
      DAY_AFTER,
    );
    expect(preview.creditsTotal).toBe(0);
  });
});

describe('a discount with no money', () => {
  it('settles what is left on a bill', async () => {
    const { accountId, billId } = await siteWithBill('Discount only');
    await recordPayment(
      session,
      { accountId, amount: 30_000, method: 'upi', paidOn: NEXT_DAY, clientUuid: nextUuid() },
      NEXT_DAY,
    );
    expect((await getBill(session, billId, NEXT_DAY)).status).toBe('partial');

    await recordPayment(
      session,
      { accountId, amount: 0, discount: 10_000, method: 'cash', paidOn: NEXT_DAY, clientUuid: nextUuid() },
      NEXT_DAY,
    );
    expect((await getBill(session, billId, NEXT_DAY)).status).toBe('paid');

    const detail = await getAccountDetail(session, accountId, NEXT_DAY);
    expect(detail.balance.balance).toBe(0);
    expect(detail.balance.paidTotal).toBe(30_000);
    expect(detail.balance.discountTotal).toBe(10_000);
  });

  it('refuses a payment with neither money nor discount', () => {
    const base = {
      accountId: '00000000-0000-4000-8000-000000000000',
      method: 'cash' as const,
      paidOn: NEXT_DAY,
      clientUuid: 'pay-discount-zero',
    };
    expect(recordPaymentSchema.safeParse({ ...base, amount: 0 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amount: 0, discount: 0 }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, amount: 0, discount: 100 }).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ ...base, amount: 100, discount: -1 }).success).toBe(false);
  });
});
