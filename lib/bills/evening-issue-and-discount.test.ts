/**
 * Two yard rules, end to end against a real Postgres:
 *
 * 1. An issue made in the evening can start billing the next day. The units
 *    are out from the issue date; rent runs from the chosen billing start.
 * 2. A bill can carry a discount off its total. It is saved as a credit on the
 *    bill's last day, so the bill and the account balance both come down.
 *
 * Shipped day count (issue day and last day both charged), minimum 1 day.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAccountDetail, openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { isLedgerError } from '../errors';
import { recordMovementBatch } from '../movements/service';
import { getMoneySummary } from '../payments/service';
import { movementBatchSchema } from '../validation/movements';
import { getBill, issueBill, previewBill } from './service';

const RATE = 10_000; // ₹100 per unit per day
const ISSUED = '2026-11-03';
const NEXT_DAY = '2026-11-04';

let db: TestDatabase;
let session: StaffSession;
let customerId: string;
let itemId: string;

let uuidCounter = 0;
const nextUuid = () => `evening-test-${String((uuidCounter += 1)).padStart(4, '0')}`;

async function openSite(name: string): Promise<string> {
  const account = await openAccount(session, { customerId, siteName: name, openedOn: ISSUED });
  return account.id;
}

async function issueTwo(accountId: string, billFrom?: string) {
  await recordMovementBatch(
    session,
    {
      accountId,
      type: 'ISSUE',
      movedAt: ISSUED,
      billFrom,
      lines: [{ itemId, qty: 2, clientUuid: nextUuid() }],
    },
    ISSUED,
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Evening Yard') returning id`,
  );
  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@evening.test', 'Yard Owner', 'super_admin') returning id`,
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
    email: 'owner@evening.test',
    name: 'Yard Owner',
  };
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('billing from the issue day', () => {
  it('charges the issue day and today: 2 × ₹100 × 2 days = ₹400', async () => {
    const accountId = await openSite('Same day');
    await issueTwo(accountId);

    const detail = await getAccountDetail(session, accountId, NEXT_DAY);
    expect(detail.accrual.rentTotal).toBe(40_000);
  });
});

describe('an evening issue billed from the next day', () => {
  let accountId: string;

  beforeAll(async () => {
    accountId = await openSite('Evening');
    await issueTwo(accountId, NEXT_DAY);
  });

  it('counts the units as out, but owes nothing on the issue day', async () => {
    const detail = await getAccountDetail(session, accountId, ISSUED);
    expect(detail.outstanding.reduce((sum, line) => sum + line.qtyOut, 0)).toBe(2);
    expect(detail.accrual.rentTotal).toBe(0);
  });

  it('starts rent the next day: 2 × ₹100 × 1 day = ₹200', async () => {
    const detail = await getAccountDetail(session, accountId, NEXT_DAY);
    expect(detail.accrual.rentTotal).toBe(20_000);
  });

  it('only allows the issue date or the day after', () => {
    const base = {
      accountId: '00000000-0000-4000-8000-000000000000',
      type: 'ISSUE' as const,
      movedAt: ISSUED,
      lines: [{ itemId: '00000000-0000-4000-8000-000000000001', qty: 1, clientUuid: 'evening-line-1' }],
    };
    expect(movementBatchSchema.safeParse({ ...base, billFrom: NEXT_DAY }).success).toBe(true);
    expect(movementBatchSchema.safeParse({ ...base, billFrom: '2026-11-05' }).success).toBe(false);
    expect(movementBatchSchema.safeParse({ ...base, billFrom: '2026-11-02' }).success).toBe(false);
    expect(
      movementBatchSchema.safeParse({ ...base, type: 'RETURN', billFrom: NEXT_DAY }).success,
    ).toBe(false);
  });
});

describe('a discount off the bill total', () => {
  let accountId: string;

  beforeAll(async () => {
    accountId = await openSite('Discount');
    await issueTwo(accountId);
  });

  it('shows the discounted total on the preview', async () => {
    const preview = await previewBill(
      session,
      accountId,
      { periodTo: NEXT_DAY, scope: 'all', discount: 5_000 },
      NEXT_DAY,
    );
    expect(preview.rentTotal).toBe(40_000);
    expect(preview.creditsTotal).toBe(5_000);
    expect(preview.grandTotal).toBe(35_000);
  });

  it('refuses a discount bigger than the bill', async () => {
    const failure = await previewBill(
      session,
      accountId,
      { periodTo: NEXT_DAY, scope: 'all', discount: 40_001 },
      NEXT_DAY,
    ).catch((error: unknown) => error);
    expect(isLedgerError(failure)).toBe(true);
  });

  it('issues the bill with the discount and lowers the balance', async () => {
    const bill = await issueBill(
      session,
      {
        accountId,
        periodFrom: ISSUED,
        periodTo: NEXT_DAY,
        scope: 'all',
        discount: 5_000,
      },
      NEXT_DAY,
    );
    expect(bill.rentTotal).toBe(40_000);
    expect(bill.creditsTotal).toBe(5_000);
    expect(bill.grandTotal).toBe(35_000);

    const detail = await getBill(session, bill.id, NEXT_DAY);
    expect(detail.frozen.adjustments).toEqual([
      expect.objectContaining({ kind: 'credit', amount: 5_000, reason: 'Discount' }),
    ]);

    const money = await getMoneySummary(session, accountId, NEXT_DAY);
    expect(money.balance).toBe(35_000);
    expect(money.pendingOnBills).toBe(35_000);
  });
});
