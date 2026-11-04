/**
 * Editing an item's minimum hire period must not reprice what is already out.
 *
 * The engine's half of this is pinned in `lib/accrual/minimum-days.test.ts`,
 * against movements built by hand. This is the other half, and the one that
 * actually breaks in production: that `recordMovementBatch` copies the item's
 * minimum onto the ISSUE row at all, and that the read path carries it back.
 * A missing column in one `select` is enough to silently drop the floor, and
 * every unit test would still pass.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StaffSession } from '../auth/guard';
import { getAccountDetail, openAccount } from '../accounts/service';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { rupeesToPaise } from '../money';
import { recordMovementBatch } from '../movements/service';
import { updateItem } from './service';

/** The owner's worked example: ₹5.00 a day, five-day minimum. */
const RATE = rupeesToPaise('5.00');
const MINIMUM_DAYS = 5;

const ISSUED_ON = '2026-06-01';
/** One day after the issue — deep inside the floor. */
const NEXT_DAY = '2026-06-02';

let db: TestDatabase;
let session: StaffSession;
let accountId: string;
let spanId: string;
let sheetId: string;
let uuid = 0;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Bismi Yard') returning id`,
  );

  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@bismi.test', 'Yard Owner', 'super_admin') returning id`,
    [org.id],
  );

  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Ibrahim', '+919846012345')
     returning id`,
    [org.id],
  );

  // The span takes the schema default; the sheet is explicitly set to bill by
  // the day. Two items, two floors, one account.
  const [span] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Span 12ft', 'SPN12', $2, 90000, 250) returning id`,
    [org.id, RATE],
  );
  spanId = span.id;

  const [sheet] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned, minimum_days)
     values ($1, 'Centering sheet', 'CS32', $2, 50000, 500, 1) returning id`,
    [org.id, RATE],
  );
  sheetId = sheet.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@bismi.test',
    name: 'Yard Owner',
  };

  const account = await openAccount(session, {
    customerId: customer.id,
    siteName: 'Muzammil site',
    openedOn: ISSUED_ON,
  });
  accountId = account.id;
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

async function lend(itemId: string, qty: number, movedAt: string) {
  uuid += 1;
  return recordMovementBatch(
    session,
    {
      accountId,
      type: 'ISSUE',
      movedAt,
      gatePassNo: null,
      lines: [{ itemId, qty, clientUuid: `freeze-test-${uuid}` }],
    },
    movedAt,
  );
}

describe('the item master seeds the floor', () => {
  it('defaults a new item to five days without anyone typing it', async () => {
    const [row] = await db.query<{ minimum_days: number }>(
      `select minimum_days from items where id = $1`,
      [spanId],
    );

    expect(row.minimum_days).toBe(MINIMUM_DAYS);
  });

  it('copies the item’s minimum onto the ISSUE row', async () => {
    await lend(spanId, 1, ISSUED_ON);

    const [row] = await db.query<{ min_days_snapshot: number }>(
      `select min_days_snapshot from movements where item_id = $1`,
      [spanId],
    );

    expect(row.min_days_snapshot).toBe(MINIMUM_DAYS);
  });

  it('bills the floor a day later, not the day held', async () => {
    const detail = await getAccountDetail(session, accountId, NEXT_DAY);

    // Held two days (issue day and today), charged five: 1 × 5 × ₹5 = ₹25.
    expect(detail.accrual.rentTotal).toBe(MINIMUM_DAYS * RATE);

    const [line] = detail.outstanding;
    expect(line.daysHeld).toBe(2);
    expect(line.minimumDays).toBe(MINIMUM_DAYS);
    expect(line.billedDays).toBe(MINIMUM_DAYS);
  });
});

describe('two items on one account keep their own floors', () => {
  it('charges the span five days and the sheet two, on the next day', async () => {
    await lend(sheetId, 1, ISSUED_ON);

    const detail = await getAccountDetail(session, accountId, NEXT_DAY);
    const span = detail.outstanding.find((line) => line.itemId === spanId)!;
    const sheet = detail.outstanding.find((line) => line.itemId === sheetId)!;

    expect(span.billedDays).toBe(MINIMUM_DAYS);
    expect(sheet.billedDays).toBe(2);
    // ₹25 for the span, ₹10 for the sheet (issue day and today).
    expect(detail.accrual.rentTotal).toBe(MINIMUM_DAYS * RATE + 2 * RATE);
  });
});

describe('editing the master does not reach equipment already out', () => {
  it('leaves the standing lot on the minimum it left the yard under', async () => {
    const before = await getAccountDetail(session, accountId, NEXT_DAY);

    await updateItem(session, spanId, { minimumDays: 2 });

    const after = await getAccountDetail(session, accountId, NEXT_DAY);

    // Same account, same day, same money — the edit is invisible to it. This
    // is the promise the items screen prints at the top of the page.
    expect(after.accrual.rentTotal).toBe(before.accrual.rentTotal);
    expect(after.outstanding.find((line) => line.itemId === spanId)!.minimumDays).toBe(
      MINIMUM_DAYS,
    );
  });

  it('applies the new minimum to the next load out', async () => {
    await lend(spanId, 1, '2026-07-01');

    const rows = await db.query<{ min_days_snapshot: number }>(
      `select min_days_snapshot from movements
       where item_id = $1 order by moved_at`,
      [spanId],
    );

    expect(rows.map((row) => row.min_days_snapshot)).toEqual([MINIMUM_DAYS, 2]);
  });

  it('refuses a minimum below one day', async () => {
    const failure = await db
      .query(`update items set minimum_days = 0 where id = $1`, [spanId])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('items_minimum_days_check');
  });
});
