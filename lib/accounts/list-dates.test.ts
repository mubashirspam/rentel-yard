/**
 * The list screens must date a lending by the lending, not by the khata.
 *
 * This is a regression test for a real confusion on the yard's phone. A tile
 * read "5 days · since 31 Jul" beside "rent ₹300" while the account screen for
 * the same site read "since 03 Aug · 1 day". Both were drawn from the same
 * ledger; the tile was simply answering a different question — how old the
 * account record was — and printing the answer where the lending's age belongs.
 *
 * It matters because backdating is ordinary here: a lorry leaves on Friday and
 * is entered on Monday, and equipment goes out to a site whose khata was opened
 * weeks earlier. The two dates are routinely far apart.
 *
 * The tell was always in the arithmetic. Rent of ₹300 at ₹75 a day is four
 * days, not the five the tile claimed, so the figures on one line could not
 * both be true. Every assertion below is worked by hand for that reason.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StaffSession } from '../auth/guard';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { recordMovementBatch } from '../movements/service';
import { listAccounts, openAccount } from './service';

/** The day the yard is looking at the screen. */
const TODAY = '2026-08-04';

/** The khata was opened days before anything went out to the site. */
const OPENED_ON = '2026-07-31';
const ISSUED_ON = '2026-08-03';

const RATE = 3_900; // ₹39.00 per unit per day

let db: TestDatabase;
let session: StaffSession;
let accountId: string;
let itemId: string;

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

  const [item] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Centering sheet 3ft x 2ft', 'CS32', $2, 50000, 500) returning id`,
    [org.id, RATE],
  );
  itemId = item.id;

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
    openedOn: OPENED_ON,
  });
  accountId = account.id;

  await recordMovementBatch(
    session,
    {
      accountId,
      type: 'ISSUE',
      movedAt: ISSUED_ON,
      gatePassNo: 'GP-001',
      lines: [{ itemId, qty: 1, clientUuid: 'list-dates-test-0001' }],
    },
    TODAY,
  );
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('a list row dates the lending, not the khata', () => {
  it('reports the day the kit went out, not the day the account opened', async () => {
    const [row] = await listAccounts(session, { status: 'open' }, TODAY);

    expect(row.outSince).toBe(ISSUED_ON);
    expect(row.openedOn).toBe(OPENED_ON);
  });

  it('counts days from the lending, so the rent on the same row adds up', async () => {
    const [row] = await listAccounts(session, { status: 'open' }, TODAY);

    // 03-Aug → 04-Aug is one day held. One unit at ₹39 a day is ₹39, which is
    // what the account screen shows and what a contractor would be billed.
    expect(row.daysOut).toBe(1);
    expect(row.perDay).toBe(RATE);
    expect(row.accruedRent).toBe(RATE);

    // The property the old tile broke: the three figures printed side by side
    // have to describe the same span of time.
    expect(row.perDay * row.daysOut).toBe(row.accruedRent);
  });

  it('still reports the khata’s own age separately', async () => {
    const [row] = await listAccounts(session, { status: 'open' }, TODAY);

    // 31-Jul → 04-Aug inclusive. The account screen legitimately shows this;
    // it is only wrong when printed as the age of the lending.
    expect(row.daysOpen).toBe(5);
    expect(row.daysOpen).not.toBe(row.daysOut);
  });

  it('has nothing to date once everything has come back', async () => {
    await recordMovementBatch(
      session,
      {
        accountId,
        type: 'RETURN',
        movedAt: TODAY,
        gatePassNo: 'GP-002',
        lines: [{ itemId, qty: 1, clientUuid: 'list-dates-test-0002' }],
      },
      TODAY,
    );

    const [row] = await listAccounts(session, { status: 'open' }, TODAY);

    expect(row.qtyOut).toBe(0);
    expect(row.outSince).toBeNull();
    expect(row.daysOut).toBe(0);
  });
});

/**
 * A site part-way through a job answers yes to both questions.
 *
 * The return screen splits sites into "still out" and "returned", and it used
 * to do it with one test — `qtyOut > 0` — as though the two were opposites.
 * They are not. Forty sheets come back on Tuesday and sixty stay standing, and
 * that site belongs in both lists: in one because there is still kit on it, in
 * the other because there is a return worth looking at. Under the old split it
 * appeared only under "still out", and the forty that came back could not be
 * reached from that screen at all.
 */
describe('a part-returned site', () => {
  it('reports what is still out and what has come back, at the same time', async () => {
    const [customer] = await db.query<{ id: string }>(
      `insert into customers (org_id, name, mobile)
       values ((select org_id from customers limit 1), 'Part Returner', '+919846000111')
       returning id`,
    );

    const account = await openAccount(session, {
      customerId: customer.id,
      siteName: 'Half-back site',
      openedOn: ISSUED_ON,
    });

    await recordMovementBatch(
      session,
      {
        accountId: account.id,
        type: 'ISSUE',
        movedAt: ISSUED_ON,
        gatePassNo: 'GP-010',
        lines: [{ itemId, qty: 100, clientUuid: 'list-dates-test-0010' }],
      },
      TODAY,
    );

    await recordMovementBatch(
      session,
      {
        accountId: account.id,
        type: 'RETURN',
        movedAt: TODAY,
        gatePassNo: 'GP-011',
        lines: [{ itemId, qty: 40, clientUuid: 'list-dates-test-0011' }],
      },
      TODAY,
    );

    const rows = await listAccounts(session, { status: 'open' }, TODAY);
    const row = rows.find((candidate) => candidate.id === account.id)!;

    expect(row.qtyOut).toBe(60);
    expect(row.qtyReturned).toBe(40);

    // The property the screen relies on: neither figure implies the other.
    expect(row.qtyOut > 0 && row.qtyReturned > 0).toBe(true);
  });
});
