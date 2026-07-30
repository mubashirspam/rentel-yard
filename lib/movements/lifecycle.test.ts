/**
 * The §13 M3 acceptance criterion, as a test.
 *
 * "A full lifecycle — open account, issue 100 jacks, add 40 spans, partial
 * return, damaged return, close — works end to end and the numbers match a
 * hand calculation."
 *
 * It runs the real services against a real Postgres (PGlite applying the
 * committed migrations), so the triggers, the check constraints, the
 * serialisable transaction, and the accrual engine are all in the path. Every
 * expected figure below is worked out by hand in a comment — a test that only
 * asserts what the code happens to produce proves nothing about the arithmetic
 * a contractor will argue about.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAccountDetail, closeAccount, listAccounts, openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { ERROR_CODES, isLedgerError } from '../errors';
import { listStock } from '../stock/service';
import { recordMovementBatch, reverseMovement } from './service';

/** The valuation date every call in this test uses as "today". */
const TODAY = '2026-06-30';

const RATE_JACK = 200; // ₹2.00 per jack per day
const RATE_SPAN = 400; // ₹4.00 per span per day
const REPLACEMENT_JACK = 45_000; // ₹450 per jack

let db: TestDatabase;
let session: StaffSession;
let jackId: string;
let spanId: string;
let customerId: string;
let accountId: string;

/** Each movement line needs its own idempotency key (§07.2). */
let uuidCounter = 0;
function nextUuid(): string {
  uuidCounter += 1;
  return `lifecycle-test-${String(uuidCounter).padStart(4, '0')}`;
}

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Lifecycle Yard') returning id`,
  );

  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@lifecycle.test', 'Yard Owner', 'super_admin') returning id`,
    [org.id],
  );

  // No `settings` row: the org has not opened the settings screen yet, so the
  // §03.1 defaults apply — inclusive_start, 15 minimum days, nearest rupee.
  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Rahim Contractor', '+919846012345')
     returning id`,
    [org.id],
  );
  customerId = customer.id;

  const [jack] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Jack 3.0m', 'JCK30', $2, $3, 600) returning id`,
    [org.id, RATE_JACK, REPLACEMENT_JACK],
  );
  jackId = jack.id;

  const [span] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Span 12ft', 'SPN12', $2, 90000, 250) returning id`,
    [org.id, RATE_SPAN],
  );
  spanId = span.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@lifecycle.test',
    name: 'Yard Owner',
  };
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

/** One gate pass through the real service. */
async function record(
  type: 'ISSUE' | 'RETURN' | 'RETURN_DAMAGED' | 'LOST',
  movedAt: string,
  lines: Array<{ itemId: string; qty: number }>,
  gatePassNo?: string,
) {
  return recordMovementBatch(
    session,
    {
      accountId,
      type,
      movedAt,
      gatePassNo: gatePassNo ?? null,
      lines: lines.map((line) => ({ ...line, clientUuid: nextUuid() })),
    },
    TODAY,
  );
}

describe('M3 — a full account lifecycle', () => {
  it('opens an account for the customer', async () => {
    const account = await openAccount(session, {
      customerId,
      siteName: 'Kakkanad site',
      openedOn: '2026-06-01',
    });

    accountId = account.id;
    expect(account.status).toBe('open');
  });

  it('issues 100 jacks on 01-Jun', async () => {
    const result = await record('ISSUE', '2026-06-01', [{ itemId: jackId, qty: 100 }], 'GP-001');

    expect(result.movements).toHaveLength(1);
    expect(result.negativeAvailability).toEqual([]);
  });

  it('adds 40 spans on 15-Jun', async () => {
    await record('ISSUE', '2026-06-15', [{ itemId: spanId, qty: 40 }], 'GP-002');

    const detail = await getAccountDetail(session, accountId, '2026-06-15');

    // Both lots open. Jacks: 01-Jun → 15-Jun is 14 days inclusive_start, but
    // the 15-day minimum floors it: 100 × 15 × ₹2 = ₹3,000. Spans: same-day
    // issue is 1 day raw, floored to 15: 40 × 15 × ₹4 = ₹2,400.
    expect(detail.accrual.rentTotal).toBe(100 * 15 * RATE_JACK + 40 * 15 * RATE_SPAN);
    expect(detail.outstanding.map((line) => [line.itemName, line.qtyOut])).toEqual([
      ['Jack 3.0m', 100],
      ['Span 12ft', 40],
    ]);
  });

  it('shows the stock view carrying both issues', async () => {
    const stock = await listStock(session);
    const jack = stock.find((row) => row.id === jackId)!;

    expect(jack.qtyOut).toBe(100);
    expect(jack.qtyAvailable).toBe(500);
    expect(jack.isNegative).toBe(false);
  });

  it('refuses a return larger than what is out, naming the item', async () => {
    const failure = await record('RETURN', '2026-06-21', [{ itemId: jackId, qty: 120 }]).catch(
      (error: unknown) => error,
    );

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING);
    expect(failure.message).toContain('Jack 3.0m');
    expect(failure.context?.outstanding).toBe(100);
  });

  it('leaves nothing behind when a batch is rejected', async () => {
    const detail = await getAccountDetail(session, accountId, '2026-06-21');
    expect(detail.accrual.outstanding[jackId]).toBe(100);
  });

  it('takes a partial return of 60 jacks on 21-Jun', async () => {
    await record('RETURN', '2026-06-21', [{ itemId: jackId, qty: 60 }], 'GP-003');

    const detail = await getAccountDetail(session, accountId, '2026-06-21');
    expect(detail.accrual.outstanding[jackId]).toBe(40);
  });

  it('takes a damaged return of 4 jacks on 25-Jun', async () => {
    await record('RETURN_DAMAGED', '2026-06-25', [{ itemId: jackId, qty: 4 }], 'GP-004');

    const detail = await getAccountDetail(session, accountId, '2026-06-25');
    expect(detail.accrual.outstanding[jackId]).toBe(36);
    expect(detail.accrual.damageTotal).toBe(4 * REPLACEMENT_JACK); // ₹1,800
  });

  it('returns the spans on 22-Jun, under the minimum period', async () => {
    // Recorded after the 25-Jun damage but dated earlier — the yard writes up
    // gate passes late, and the engine orders by moved_at, not entry order.
    await record('RETURN', '2026-06-22', [{ itemId: spanId, qty: 40 }], 'GP-005');

    const detail = await getAccountDetail(session, accountId, TODAY);
    const spanLine = detail.accrual.lines.find((line) => line.itemId === spanId)!;

    expect(spanLine.rawDays).toBe(7); // 15-Jun → 22-Jun
    expect(spanLine.days).toBe(15);
    expect(spanLine.minimumApplied).toBe(true);
  });

  it('refuses to close while 36 jacks are still out', async () => {
    const failure = await closeAccount(session, accountId, { closedOn: TODAY }).catch(
      (error: unknown) => error,
    );

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.ACCOUNT_NOT_EMPTY);
  });

  it('takes the last 36 jacks back on 30-Jun and matches the hand calculation', async () => {
    await record('RETURN', TODAY, [{ itemId: jackId, qty: 36 }], 'GP-006');

    const detail = await getAccountDetail(session, accountId, TODAY);

    /*
     * Hand calculation. One jack lot (100 on 01-Jun at ₹2/day) consumed FIFO in
     * three slices, one span lot (40 on 15-Jun at ₹4/day) consumed in one.
     * inclusive_start: the issue day is billed, the return day is not.
     *
     *   60 jacks  01-Jun → 21-Jun   20 days   60 × 20 × ₹2  =  ₹2,400
     *    4 jacks  01-Jun → 25-Jun   24 days    4 × 24 × ₹2  =    ₹192   (damaged)
     *   36 jacks  01-Jun → 30-Jun   29 days   36 × 29 × ₹2  =  ₹2,088
     *   40 spans  15-Jun → 22-Jun    7 → 15   40 × 15 × ₹4  =  ₹2,400   (minimum)
     *                                                Rent      ₹7,080
     *   Damaged: Jack 3.0m × 4 @ ₹450                 Damages   ₹1,800
     *                                                 ─────────────────
     *                                                 Due       ₹8,880
     */
    const rent = 240_000 + 19_200 + 208_800 + 240_000;
    expect(rent).toBe(708_000); // ₹7,080 — the arithmetic above, in paise
    expect(detail.accrual.rentTotal).toBe(rent);
    expect(detail.accrual.damageTotal).toBe(180_000);
    expect(detail.balance.balance).toBe(888_000);
    expect(detail.balance.status).toBe('due');

    // Four slices, one per return, in ledger order.
    expect(detail.accrual.lines.map((line) => [line.qty, line.days, line.amount])).toEqual([
      [60, 20, 240_000],
      [4, 24, 19_200],
      [36, 29, 208_800],
      [40, 15, 240_000],
    ]);

    expect(detail.outstanding).toEqual([]);
    expect(detail.canClose).toBe(true);
  });

  it('interleaves the ledger newest first, naming who entered each row', async () => {
    const detail = await getAccountDetail(session, accountId, TODAY);

    expect(detail.ledger).toHaveLength(6);
    expect(detail.ledger[0]).toMatchObject({ kind: 'movement', movedAt: TODAY, qty: 36 });
    expect(detail.ledger.every((entry) => entry.by === 'Yard Owner')).toBe(true);
  });

  it('ignores a later change to the master rate', async () => {
    // §02: rate_snapshot is frozen onto the ISSUE, so re-pricing the item
    // cannot alter history. The real M4 criterion is about frozen bill lines;
    // this is the same invariant one layer down.
    await db.query(`update items set rate_per_day = 900 where id = $1`, [jackId]);

    const detail = await getAccountDetail(session, accountId, TODAY);
    expect(detail.accrual.rentTotal).toBe(708_000);

    await db.query(`update items set rate_per_day = $2 where id = $1`, [jackId, RATE_JACK]);
  });

  it('closes the account once everything is back', async () => {
    const account = await closeAccount(session, accountId, { closedOn: TODAY });

    expect(account.status).toBe('closed');
    expect(account.closedOn).toBe(TODAY);
  });

  it('refuses to record anything against a closed account', async () => {
    const failure = await record('ISSUE', TODAY, [{ itemId: jackId, qty: 1 }]).catch(
      (error: unknown) => error,
    );

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('refuses to close twice', async () => {
    const failure = await closeAccount(session, accountId, { closedOn: TODAY }).catch(
      (error: unknown) => error,
    );

    expect(isLedgerError(failure)).toBe(true);
  });

  it('returns the yard to full stock', async () => {
    const stock = await listStock(session);
    const jack = stock.find((row) => row.id === jackId)!;

    // §02: LOST reduces owned stock; a damaged return does not — the item is
    // physically back in the yard and was charged for at replacement rate.
    expect(jack.qtyOut).toBe(0);
    expect(jack.qtyLost).toBe(0);
    expect(jack.qtyAvailable).toBe(600);
  });

  it('lists the closed account with its final balance', async () => {
    const accounts = await listAccounts(session, { status: 'all' }, TODAY);
    const closed = accounts.find((account) => account.id === accountId)!;

    expect(closed).toMatchObject({
      status: 'closed',
      customerName: 'Rahim Contractor',
      balance: 888_000,
      qtyOut: 0,
    });
  });
});

describe('M3 — corrections are reversals, never edits', () => {
  let correctionAccountId: string;
  let issueId: string;

  beforeAll(async () => {
    const account = await openAccount(session, {
      customerId,
      siteName: 'Aluva site',
      openedOn: '2026-06-01',
    });
    correctionAccountId = account.id;
    accountId = correctionAccountId;

    const result = await record('ISSUE', '2026-06-10', [{ itemId: jackId, qty: 20 }], 'GP-101');
    issueId = result.movements[0].id;
  });

  it('reverses a wrongly entered issue', async () => {
    const reversal = await reverseMovement(
      session,
      issueId,
      { reason: 'Entered against the wrong site', movedAt: TODAY, clientUuid: nextUuid() },
      TODAY,
    );

    expect(reversal.reversesId).toBe(issueId);

    const detail = await getAccountDetail(session, correctionAccountId, TODAY);
    expect(detail.accrual.rentTotal).toBe(0);
    expect(detail.canClose).toBe(true);

    // The original is still there — the ledger shows what was recorded and
    // what was taken back (§02).
    const entries = detail.ledger.filter((entry) => entry.kind === 'movement');
    expect(entries).toHaveLength(2);
  });

  it('refuses to reverse the same movement twice', async () => {
    const failure = await reverseMovement(
      session,
      issueId,
      { reason: 'Trying again', movedAt: TODAY, clientUuid: nextUuid() },
      TODAY,
    ).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.code).toBe(ERROR_CODES.CONFLICT);
  });

  it('refuses to reverse an issue that returns have already consumed', async () => {
    const issued = await record('ISSUE', '2026-06-10', [{ itemId: jackId, qty: 10 }], 'GP-102');
    await record('RETURN', '2026-06-20', [{ itemId: jackId, qty: 10 }], 'GP-103');

    const failure = await reverseMovement(
      session,
      issued.movements[0].id,
      { reason: 'Wrong quantity', movedAt: TODAY, clientUuid: nextUuid() },
      TODAY,
    ).catch((error: unknown) => error);

    expect(isLedgerError(failure)).toBe(true);
    if (!isLedgerError(failure)) return;
    expect(failure.message).toContain('Reverse those first');
  });
});
