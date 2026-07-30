/**
 * The §13 M4 acceptance criterion, as a test.
 *
 * "Issuing a bill, then changing an item's master rate, leaves the bill's
 * totals unchanged."
 *
 * That is the whole promise of a frozen bill: what a contractor was shown on
 * paper cannot move afterwards, whatever anyone does on /items. Everything else
 * here — invoice numbering, oldest-first allocation, payment status, the
 * database's refusal to edit a bill — is what makes that promise stick.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { ERROR_CODES, isLedgerError } from '../errors';
import { recordMovementBatch } from '../movements/service';
import { addAdjustment, getMoneySummary, recordPayment } from '../payments/service';
import {
  getBill,
  issueBill,
  listBillsForAccount,
  listOverdueBills,
  previewBill,
} from './service';

const RATE_JACK = 200; // ₹2.00 per jack per day
const JUNE_END = '2026-06-30';
const JULY_END = '2026-07-31';

let db: TestDatabase;
let session: StaffSession;
let orgId: string;
let jackId: string;
let accountId: string;

let uuidCounter = 0;
const nextUuid = () => `bill-test-${String((uuidCounter += 1)).padStart(4, '0')}`;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Billing Yard') returning id`,
  );
  orgId = org.id;

  // A settings row with a known prefix, so the invoice number is predictable.
  await db.query(
    `insert into settings (org_id, billing, invoice_prefix, next_invoice_no, payment_terms_days)
     values ($1, $2::jsonb, 'INV', 42, 7)`,
    [
      orgId,
      JSON.stringify({
        day_count_mode: 'inclusive_start',
        minimum_days: 15,
        minimum_days_applies: 'per_issue_lot',
        rounding: 'nearest_rupee',
        damage_charge_mode: 'replacement_rate',
        accrual_stops_on_bill: false,
      }),
    ],
  );

  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@billing.test', 'Yard Owner', 'super_admin') returning id`,
    [orgId],
  );

  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Rahim Contractor', '+919846012345')
     returning id`,
    [orgId],
  );

  const [jack] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Jack 3.0m', 'JCK30', $2, 45000, 600) returning id`,
    [orgId, RATE_JACK],
  );
  jackId = jack.id;

  session = {
    userId: user.id,
    orgId,
    role: 'super_admin',
    email: 'owner@billing.test',
    name: 'Yard Owner',
  };

  const account = await openAccount(session, {
    customerId: customer.id,
    siteName: 'Kakkanad site',
    openedOn: '2026-06-01',
  });
  accountId = account.id;

  // 100 jacks out on 01-Jun and still out at the end of June.
  await recordMovementBatch(
    session,
    {
      accountId,
      type: 'ISSUE',
      movedAt: '2026-06-01',
      gatePassNo: 'GP-001',
      lines: [{ itemId: jackId, qty: 100, clientUuid: nextUuid() }],
    },
    JUNE_END,
  );
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('M4 — issuing the first bill', () => {
  let billId: string;

  it('previews the period before anything is written', async () => {
    const preview = await previewBill(session, accountId, {}, JUNE_END);

    // Defaults to the account opening through today, since nothing is billed.
    expect(preview.periodFrom).toBe('2026-06-01');
    expect(preview.periodTo).toBe(JUNE_END);
    // 01-Jun → 30-Jun inclusive_start = 29 days. 100 × 29 × ₹2 = ₹5,800.
    expect(preview.rentTotal).toBe(580_000);
    expect(preview.grandTotal).toBe(580_000);

    const bills = await listBillsForAccount(session, accountId, JUNE_END);
    expect(bills).toEqual([]);
  });

  it('includes an adjustment applied inside the period', async () => {
    await addAdjustment(
      session,
      {
        accountId,
        kind: 'charge',
        amount: 150_000, // ₹1,500 transport, per the §09 sample bill
        reason: 'Transport',
        appliedOn: '2026-06-15',
        clientUuid: nextUuid(),
      },
      JUNE_END,
    );

    const preview = await previewBill(session, accountId, {}, JUNE_END);
    expect(preview.chargesTotal).toBe(150_000);
    expect(preview.grandTotal).toBe(580_000 + 150_000); // ₹7,300
  });

  it('issues the bill with a number from settings and a due date from the terms', async () => {
    const bill = await issueBill(
      session,
      { accountId, periodFrom: '2026-06-01', periodTo: JUNE_END },
      JUNE_END,
    );

    billId = bill.id;

    expect(bill.invoiceNo).toBe('INV-2026-0042');
    expect(bill.grandTotal).toBe(730_000);
    expect(bill.dueOn).toBe('2026-07-07'); // 30-Jun + 7 days
    expect(bill.status).toBe('pending');
    expect(bill.outstanding).toBe(730_000);
  });

  /** The M4 criterion itself. */
  it('does not move when the item master rate changes afterwards', async () => {
    const before = await getBill(session, billId, JUNE_END);

    await db.query(`update items set rate_per_day = 900, replacement_rate = 99999 where id = $1`, [
      jackId,
    ]);

    const after = await getBill(session, billId, JUNE_END);

    expect(after.rentTotal).toBe(before.rentTotal);
    expect(after.grandTotal).toBe(before.grandTotal);
    expect(after.frozen.lines).toEqual(before.frozen.lines);
    expect(after.frozen.lines[0].ratePerDay).toBe(RATE_JACK);

    // Put it back, so the rest of the test reasons about ₹2/day.
    await db.query(`update items set rate_per_day = $2, replacement_rate = 45000 where id = $1`, [
      jackId,
      RATE_JACK,
    ]);
  });

  it('refuses to be edited or deleted, at the database level', async () => {
    const update = await db.expectRejection(
      `update bills set grand_total = 1 where id = $1`,
      [billId],
    );
    expect(update).toMatch(/immutable|append/i);

    const remove = await db.expectRejection(`delete from bills where id = $1`, [billId]);
    expect(remove).toMatch(/immutable|append/i);
  });

  it('refuses a second bill over the same period', async () => {
    const failure = await issueBill(
      session,
      { accountId, periodFrom: '2026-06-15', periodTo: JULY_END },
      JULY_END,
    ).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.CONFLICT);
    expect(failure.message).toContain('2026-06-30');
  });

  it('refuses a period that has not happened yet', async () => {
    const failure = await issueBill(
      session,
      { accountId, periodFrom: '2026-07-01', periodTo: '2026-12-31' },
      JULY_END,
    ).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.INVALID_DATE);
  });
});

describe('M4 — payments', () => {
  it('records money received and settles it against the oldest bill', async () => {
    const result = await recordPayment(
      session,
      {
        accountId,
        amount: 500_000, // ₹5,000 of the ₹7,300 owed
        method: 'upi',
        paidOn: '2026-07-05',
        reference: 'UPI/123456',
        clientUuid: nextUuid(),
      },
      JULY_END,
    );

    expect(result.allocatedToBills).toBe(500_000);
    expect(result.unallocated).toBe(0);

    const [bill] = await listBillsForAccount(session, accountId, '2026-07-05');
    expect(bill.allocated).toBe(500_000);
    expect(bill.outstanding).toBe(230_000);
    expect(bill.status).toBe('partial');
  });

  it('turns the bill overdue once the due date passes', async () => {
    const [bill] = await listBillsForAccount(session, accountId, '2026-07-20');
    expect(bill.status).toBe('overdue');

    const queue = await listOverdueBills(session, '2026-07-20');
    expect(queue.map((row) => [row.invoiceNo, row.customerName, row.outstanding])).toEqual([
      ['INV-2026-0042', 'Rahim Contractor', 230_000],
    ]);
  });

  it('rejects the same receipt pushed twice', async () => {
    const clientUuid = nextUuid();
    const input = {
      accountId,
      amount: 10_000,
      method: 'cash' as const,
      paidOn: '2026-07-06',
      clientUuid,
    };

    await recordPayment(session, input, JULY_END);
    const failure = await recordPayment(session, input, JULY_END).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('keeps surplus money as an advance rather than forcing it onto a bill', async () => {
    // ₹2,200 still owed on the bill after ₹5,000 + ₹100. Pay ₹5,000.
    const result = await recordPayment(
      session,
      {
        accountId,
        amount: 500_000,
        method: 'cash',
        paidOn: '2026-07-08',
        clientUuid: nextUuid(),
      },
      JULY_END,
    );

    expect(result.allocatedToBills).toBe(220_000);
    expect(result.unallocated).toBe(280_000);

    const [bill] = await listBillsForAccount(session, accountId, JULY_END);
    expect(bill.status).toBe('paid');
    expect(bill.outstanding).toBe(0);
    expect(await listOverdueBills(session, JULY_END)).toEqual([]);
  });

  it('reports what is billed, paid, pending, and not yet billed', async () => {
    const summary = await getMoneySummary(session, accountId, JULY_END);

    // Billed ₹7,300, received ₹10,100 in three payments.
    expect(summary.billedTotal).toBe(730_000);
    expect(summary.paidTotal).toBe(1_010_000);
    expect(summary.pendingOnBills).toBe(0);

    // July's rent has accrued but is on no bill yet: 100 jacks × 31 days × ₹2.
    expect(summary.unbilled).toBe(summary.balance);
    expect(summary.balance).toBe(730_000 + 620_000 - 1_010_000);
  });
});

describe('M4 — the second period', () => {
  it('starts the day after the last bill and charges only its own days', async () => {
    const preview = await previewBill(session, accountId, {}, JULY_END);

    expect(preview.periodFrom).toBe('2026-07-01');
    expect(preview.lastPeriodTo).toBe(JUNE_END);
    // 30-Jun → 31-Jul adds 31 days on 100 jacks at ₹2 = ₹6,200.
    expect(preview.rentTotal).toBe(620_000);
    expect(preview.billedEarlier).toBe(580_000);
  });

  it('takes the next invoice number and re-settles the advance against it', async () => {
    const bill = await issueBill(
      session,
      { accountId, periodFrom: '2026-07-01', periodTo: JULY_END },
      JULY_END,
    );

    expect(bill.invoiceNo).toBe('INV-2026-0043');
    expect(bill.grandTotal).toBe(620_000);

    // The ₹2,800 left over from July's payments lands on this bill by itself,
    // which makes it part-paid the moment it is issued.
    expect(bill.allocated).toBe(280_000);
    expect(bill.outstanding).toBe(340_000);
    expect(bill.status).toBe('partial');

    const summary = await getMoneySummary(session, accountId, JULY_END);
    expect(summary.pendingOnBills).toBe(340_000);
    expect(summary.unbilled).toBe(0);
    expect(summary.balance).toBe(340_000);
  });

  it('shows both bills against the account, newest first', async () => {
    const bills = await listBillsForAccount(session, accountId, JULY_END);

    expect(bills.map((bill) => [bill.invoiceNo, bill.status])).toEqual([
      ['INV-2026-0043', 'partial'],
      ['INV-2026-0042', 'paid'],
    ]);
  });

  it('refuses to bill a period with nothing in it', async () => {
    // Everything comes back on 05-Aug, and August's rent is billed to the 10th.
    await recordMovementBatch(
      session,
      {
        accountId,
        type: 'RETURN',
        movedAt: '2026-08-05',
        lines: [{ itemId: jackId, qty: 100, clientUuid: nextUuid() }],
      },
      '2026-08-10',
    );

    const august = await issueBill(
      session,
      { accountId, periodFrom: '2026-08-01', periodTo: '2026-08-10' },
      '2026-08-10',
    );
    expect(august.rentTotal).toBe(100 * 5 * RATE_JACK); // 31-Jul → 05-Aug

    // September has no equipment out, no damage, and no adjustments. There is
    // nothing to invoice, and an invoice for ₹0 is just confusing paperwork.
    const failure = await issueBill(
      session,
      { accountId, periodFrom: '2026-08-11', periodTo: '2026-08-20' },
      '2026-08-20',
    ).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.CONFLICT);
    expect(failure.message).toContain('nothing to bill');
  });
});

describe('M4 — a gate pass written up after its period was billed', () => {
  it('surfaces the rent no bill has ever charged', async () => {
    // July was billed on the 31st. This lot went out on the 15th and came back
    // on the 20th, and only reaches the ledger now — a gate pass found in the
    // cab of a lorry, which is an ordinary week in a yard.
    await recordMovementBatch(
      session,
      {
        accountId,
        type: 'ISSUE',
        movedAt: '2026-07-15',
        lines: [{ itemId: jackId, qty: 10, clientUuid: nextUuid() }],
      },
      '2026-08-20',
    );
    await recordMovementBatch(
      session,
      {
        accountId,
        type: 'RETURN',
        movedAt: '2026-07-20',
        lines: [{ itemId: jackId, qty: 10, clientUuid: nextUuid() }],
      },
      '2026-08-20',
    );

    const preview = await previewBill(session, accountId, {}, '2026-08-20');

    /*
     * FIFO makes this less obvious than it looks. The 20-Jul return does not
     * close the lot issued on 15-Jul — it consumes the oldest open lot, which is
     * still the 100 jacks from 01-Jun. Re-slicing the whole history gives:
     *
     *   10 units  01-Jun → 20-Jul   49 days  =  ₹980
     *   90 units  01-Jun → 05-Aug   65 days  = ₹11,700
     *   10 units  15-Jul → 05-Aug   21 days  =    ₹420
     *                                          ────────
     *                                          ₹13,100
     *
     * The three bills already issued charged ₹5,800 + ₹6,200 + ₹1,000 = ₹13,000.
     * So ₹100 of rent now exists that no bill has ever charged. Those bills are
     * immutable and this period starts in August, so without the warning the
     * money would simply never be asked for.
     */
    expect(preview.earlierPeriodGap).toBe(10_000);
  });

  it('is settled by an adjustment on the next bill', async () => {
    await addAdjustment(
      session,
      {
        accountId,
        kind: 'charge',
        amount: 10_000,
        reason: 'Rent from 15-Jul gate pass, recorded late',
        appliedOn: '2026-08-20',
        clientUuid: nextUuid(),
      },
      '2026-08-20',
    );

    const bill = await issueBill(
      session,
      { accountId, periodFrom: '2026-08-11', periodTo: '2026-08-20' },
      '2026-08-20',
    );

    expect(bill.chargesTotal).toBe(10_000);
    expect(bill.grandTotal).toBe(10_000);

    // The warning clears once a bill has been raised over it, so it prompts
    // exactly once — at the moment an admin can still act on it — rather than
    // nagging on every screen forever.
    const after = await previewBill(session, accountId, {}, '2026-08-21');
    expect(after.earlierPeriodGap).toBe(0);
  });
});
