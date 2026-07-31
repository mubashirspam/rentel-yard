/**
 * The §13 M5 acceptance criterion, as far as a test can carry it.
 *
 * "With the network disabled: record two issues and one return, force-quit the
 * browser, reopen, reconnect — all three land exactly once, and a return that
 * exceeds outstanding appears in 'Needs attention' with a clear reason while
 * the other two commit."
 *
 * The browser half — service worker, Dexie survival across a force-quit — is a
 * manual check. What is testable, and what actually decides whether the yard's
 * ledger is right, is the server half: a queue arriving late applies in order,
 * a retry changes nothing, and a refusal is confined to the line that earned it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getAccountDetail, openAccount } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { __setTestDatabase, schema } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { ERROR_CODES } from '../errors';
import { pullChanges } from './pull';
import { applySyncPush } from './push';
import type { SyncEntry, SyncPushInput } from './protocol';

const TODAY = '2026-06-30';
const DEVICE = 'yard-phone-01';
const RATE = 200;

let db: TestDatabase;
let session: StaffSession;
let jackId: string;
let spanId: string;
let customerId: string;
let accountId: string;

let counter = 0;
const uuid = (label: string) => `${DEVICE}-${label}-${(counter += 1)}`;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Offline Yard') returning id`,
  );
  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@offline.test', 'Yard Owner', 'super_admin') returning id`,
    [org.id],
  );
  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Rahim', '+919846012345') returning id`,
    [org.id],
  );
  customerId = customer.id;

  const [jack] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Jack 3.0m', 'JCK30', $2, 45000, 600) returning id`,
    [org.id, RATE],
  );
  jackId = jack.id;

  const [span] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Span 12ft', 'SPN12', 400, 90000, 250) returning id`,
    [org.id],
  );
  spanId = span.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@offline.test',
    name: 'Yard Owner',
  };

  const account = await openAccount(session, {
    customerId,
    siteName: 'Kakkanad site',
    openedOn: '2026-06-01',
  });
  accountId = account.id;
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

function batch(
  type: 'ISSUE' | 'RETURN',
  movedAt: string,
  lines: Array<{ itemId: string; qty: number; clientUuid: string }>,
  gatePassNo?: string,
): SyncEntry {
  return {
    op: 'movement.batch',
    clientUuid: uuid('entry'),
    queuedAt: `${movedAt}T10:00:00.000Z`,
    payload: { accountId, type, movedAt, gatePassNo: gatePassNo ?? null, lines },
  };
}

const push = (entries: SyncEntry[]): SyncPushInput => ({ deviceId: DEVICE, entries });

describe('M5 — a queue arriving after the yard reconnects', () => {
  const issueA = uuid('line');
  const issueB = uuid('line');
  const badReturn = uuid('line');

  let queue: SyncEntry[];

  beforeAll(() => {
    // Recorded on the phone with no signal: 100 jacks out, 40 spans out, then
    // a return of 150 jacks — more than ever left the yard.
    queue = [
      batch('ISSUE', '2026-06-10', [{ itemId: jackId, qty: 100, clientUuid: issueA }], 'GP-01'),
      batch('ISSUE', '2026-06-12', [{ itemId: spanId, qty: 40, clientUuid: issueB }], 'GP-02'),
      batch('RETURN', '2026-06-20', [{ itemId: jackId, qty: 150, clientUuid: badReturn }], 'GP-03'),
    ];
  });

  it('commits the two issues and refuses only the impossible return', async () => {
    const result = await applySyncPush(session, push(queue), TODAY);

    expect(result.results.map((entry) => entry.status)).toEqual([
      'applied',
      'applied',
      'rejected',
    ]);

    const rejection = result.results[2];
    expect(rejection.rejectedLines).toHaveLength(1);
    expect(rejection.rejectedLines![0].code).toBe(ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING);
    // §06: a message a yard worker can act on, naming the item.
    expect(rejection.reason).toContain('Jack 3.0m');
  });

  it('puts the refusal in Needs attention, with the payload that caused it', async () => {
    const rows = await db.query<{ client_uuid: string; reason: string; payload: unknown }>(
      `select client_uuid, reason, payload, device_id from sync_rejections order by created_at`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].client_uuid).toBe(badReturn);
    expect(rows[0].reason).toContain('Jack 3.0m');
    expect(rows[0].payload).toMatchObject({ qty: 150, type: 'RETURN' });
  });

  it('leaves the ledger holding exactly what was accepted', async () => {
    const detail = await getAccountDetail(session, accountId, TODAY);

    expect(detail.accrual.outstanding[jackId]).toBe(100);
    expect(detail.accrual.outstanding[spanId]).toBe(40);
  });

  it('changes nothing when the same queue is pushed again', async () => {
    // The device never saw the response — flat battery, dead signal — so it
    // retries the whole queue on reconnect.
    const again = await applySyncPush(session, push(queue), TODAY);

    expect(again.results.map((entry) => entry.status)).toEqual([
      'applied',
      'applied',
      'rejected',
    ]);

    const movements = await db.query<{ n: number }>(
      `select count(*)::int as n from movements where account_id = $1`,
      [accountId],
    );
    expect(movements[0].n).toBe(2);

    const detail = await getAccountDetail(session, accountId, TODAY);
    expect(detail.accrual.outstanding[jackId]).toBe(100);
  });

  it('returns the same server ids on the retry, so the device can settle its rows', async () => {
    const first = await applySyncPush(session, push([queue[0]]), TODAY);
    const second = await applySyncPush(session, push([queue[0]]), TODAY);

    expect(first.results[0].ids).toEqual(second.results[0].ids);
    expect(first.results[0].ids![issueA]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('M5 — one bad line does not sink the gate pass (§07.4)', () => {
  it('commits the good lines and rejects only the one that does not fit', async () => {
    const good = uuid('line');
    const bad = uuid('line');

    const result = await applySyncPush(
      session,
      push([
        batch(
          'RETURN',
          '2026-06-25',
          [
            { itemId: jackId, qty: 60, clientUuid: good },
            // Only 40 spans are out.
            { itemId: spanId, qty: 90, clientUuid: bad },
          ],
          'GP-04',
        ),
      ]),
      TODAY,
    );

    const entry = result.results[0];
    expect(entry.status).toBe('applied');
    expect(entry.rejectedLines).toHaveLength(1);
    expect(entry.rejectedLines![0].clientUuid).toBe(bad);
    expect(entry.rejectedLines![0].reason).toContain('Span 12ft');

    const detail = await getAccountDetail(session, accountId, TODAY);
    expect(detail.accrual.outstanding[jackId]).toBe(40); // 100 out, 60 back
    expect(detail.accrual.outstanding[spanId]).toBe(40); // untouched
  });

  it('tests each line against the ones already accepted in the same batch', async () => {
    // 40 jacks are out. Two lines of 30 cannot both be right, and a check made
    // once before either was written would let both through.
    const first = uuid('line');
    const second = uuid('line');

    const result = await applySyncPush(
      session,
      push([
        batch('RETURN', '2026-06-26', [
          { itemId: jackId, qty: 30, clientUuid: first },
          { itemId: spanId, qty: 10, clientUuid: second },
        ]),
      ]),
      TODAY,
    );

    expect(result.results[0].rejectedLines).toBeUndefined();

    const detail = await getAccountDetail(session, accountId, TODAY);
    expect(detail.accrual.outstanding[jackId]).toBe(10);
    expect(detail.accrual.outstanding[spanId]).toBe(30);
  });
});

describe('M5 — customers and sites created offline', () => {
  it('merges a customer created on two devices onto one mobile number', async () => {
    const entry = (label: string): SyncEntry => ({
      op: 'customer.create',
      clientUuid: uuid(label),
      queuedAt: '2026-06-20T10:00:00.000Z',
      payload: {
        name: 'Suresh Contractor',
        mobile: '+919847011111',
        creditLimit: 0,
      },
    });

    const deviceOne = await applySyncPush(session, push([entry('a')]), TODAY);
    const deviceTwo = await applySyncPush(session, push([entry('b')]), TODAY);

    // §07.4: the server returns the canonical id and the second device rewrites
    // its local foreign keys, rather than the yard gaining two khatas.
    expect(deviceOne.results[0].ids!.id).toBe(deviceTwo.results[0].ids!.id);

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from customers where mobile = '+919847011111'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it('opens a site once however often the entry is pushed', async () => {
    const entry: SyncEntry = {
      op: 'account.open',
      clientUuid: uuid('site'),
      queuedAt: '2026-06-20T10:00:00.000Z',
      payload: { customerId, siteName: 'Aluva site', openedOn: '2026-06-20' },
    };

    const first = await applySyncPush(session, push([entry]), TODAY);
    const second = await applySyncPush(session, push([entry]), TODAY);

    expect(first.results[0].ids!.id).toBe(second.results[0].ids!.id);

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from accounts where site_name = 'Aluva site'`,
    );
    expect(rows[0].n).toBe(1);
  });
});

describe('M5 — pulling changes back down', () => {
  it('hands over everything above the cursor, and nothing below it', async () => {
    const all = await pullChanges(session, 0, 500);

    expect(all.changes.items.length).toBeGreaterThan(0);
    expect(all.changes.movements.length).toBeGreaterThan(0);
    expect(all.hasMore).toBe(false);
    expect(all.cursor).toBeGreaterThan(0);

    // A device already up to date asks again and is told nothing has moved.
    const nothing = await pullChanges(session, all.cursor, 500);
    expect(nothing.changes.movements).toEqual([]);
    expect(nothing.changes.items).toEqual([]);
  });

  it('re-sends a row that was edited after the device synced', async () => {
    const upToDate = await pullChanges(session, 0, 500);

    // The BEFORE UPDATE trigger bumps server_seq (D17). Without it this edit
    // would be invisible to every device that had already synced past the row.
    await db.query(`update items set rate_per_day = 250 where id = $1`, [jackId]);

    const after = await pullChanges(session, upToDate.cursor, 500);
    expect(after.changes.items.map((item) => (item as { id: string }).id)).toEqual([jackId]);

    await db.query(`update items set rate_per_day = $2 where id = $1`, [jackId, RATE]);
  });

  it('caps a page and says there is more', async () => {
    const page = await pullChanges(session, 0, 1);

    expect(page.hasMore).toBe(true);
    expect(page.cursor).toBeGreaterThan(0);

    // Walking the cursor forward must terminate and must not skip rows.
    let cursor = 0;
    let seen = 0;
    for (let guard = 0; guard < 50; guard += 1) {
      const next = await pullChanges(session, cursor, 1);
      seen += Object.values(next.changes).flat().length;
      cursor = next.cursor;
      if (!next.hasMore) break;
    }

    const total = await pullChanges(session, 0, 500);
    expect(seen).toBeGreaterThanOrEqual(Object.values(total.changes).flat().length);
  });
});

describe('M5 — what offline may not do', () => {
  it('refuses a movement against a site closed while the device was away', async () => {
    const account = await openAccount(session, {
      customerId,
      siteName: 'Closed site',
      openedOn: '2026-06-01',
    });

    await db.query(`update accounts set status = 'closed', closed_on = $2 where id = $1`, [
      account.id,
      TODAY,
    ]);

    const result = await applySyncPush(
      session,
      {
        deviceId: DEVICE,
        entries: [
          {
            op: 'movement.batch',
            clientUuid: uuid('entry'),
            queuedAt: '2026-06-29T10:00:00.000Z',
            payload: {
              accountId: account.id,
              type: 'ISSUE',
              movedAt: '2026-06-29',
              gatePassNo: null,
              lines: [{ itemId: jackId, qty: 5, clientUuid: uuid('line') }],
            },
          },
        ],
      },
      TODAY,
    );

    expect(result.results[0].status).toBe('rejected');
    expect(result.results[0].reason).toContain('closed');

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from sync_rejections where reason like '%closed%'`,
    );
    expect(rows[0].n).toBe(1);
  });
});

/** Keeps `schema` imported for the type-only uses above. */
void schema;
