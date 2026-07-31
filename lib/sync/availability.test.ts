/**
 * The device's availability arithmetic, checked against the database view it
 * duplicates.
 *
 * The last case is the one that matters: it runs the *same movements* through
 * this function and through `v_item_stock` on a real Postgres, and insists they
 * agree. Two numbers for the same question — one on the phone, one on the
 * server — is exactly the failure this is here to prevent.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../db/harness';
import { availabilityByItem, isLowStock, qtyAvailable, type AvailabilityMovement } from './availability';

const JACK = 'item-jack';

const movement = (
  id: string,
  type: AvailabilityMovement['type'],
  qty: number,
  reversesId?: string,
): AvailabilityMovement => ({ id, itemId: JACK, type, qty, reversesId });

describe('availability on the device', () => {
  it('counts issues out and returns back', () => {
    const totals = availabilityByItem([
      movement('m1', 'ISSUE', 100),
      movement('m2', 'RETURN', 40),
    ]).get(JACK)!;

    expect(totals.qtyOut).toBe(60);
    expect(qtyAvailable(600, totals)).toBe(540);
  });

  it('treats a damaged return as back in the yard', () => {
    // §02: damage is charged at the replacement rate, but the item is
    // physically back. Only LOST reduces what the yard owns.
    const totals = availabilityByItem([
      movement('m1', 'ISSUE', 100),
      movement('m2', 'RETURN_DAMAGED', 10),
    ]).get(JACK)!;

    expect(totals.qtyOut).toBe(90);
    expect(totals.qtyLost).toBe(0);
    expect(qtyAvailable(600, totals)).toBe(510);
  });

  it('writes lost items off the owned stock', () => {
    const totals = availabilityByItem([
      movement('m1', 'ISSUE', 100),
      movement('m2', 'LOST', 10),
    ]).get(JACK)!;

    expect(totals.qtyOut).toBe(90);
    expect(totals.qtyLost).toBe(10);
    // 600 owned − 10 lost − 90 out
    expect(qtyAvailable(600, totals)).toBe(500);
  });

  it('ignores a movement that was reversed, and the reversal itself', () => {
    const totals = availabilityByItem([
      movement('m1', 'ISSUE', 100),
      movement('m2', 'ISSUE', 50),
      movement('m3', 'REVERSAL', 50, 'm2'),
    ]).get(JACK)!;

    expect(totals.qtyOut).toBe(100);
  });

  it('lets availability go negative rather than clamping', () => {
    // §07.4: two devices oversold offline. The equipment left the yard, so the
    // ledger says so and the stock screen raises it for reconciliation.
    const totals = availabilityByItem([movement('m1', 'ISSUE', 700)]).get(JACK)!;

    expect(qtyAvailable(600, totals)).toBe(-100);
  });

  it('flags low stock the same way the server does', () => {
    expect(isLowStock(600, 59)).toBe(true);
    expect(isLowStock(600, 60)).toBe(false);
    expect(isLowStock(600, -1)).toBe(false); // negative is its own, louder state
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe('agreement with v_item_stock', () => {
  let db: TestDatabase;
  let itemId: string;
  let accountId: string;
  let orgId: string;

  beforeAll(async () => {
    db = await createTestDatabase();

    const [org] = await db.query<{ id: string }>(
      `insert into orgs (name) values ('Mirror Yard') returning id`,
    );
    orgId = org.id;

    const [customer] = await db.query<{ id: string }>(
      `insert into customers (org_id, name, mobile) values ($1, 'Rahim', '+919846012345') returning id`,
      [orgId],
    );
    const [item] = await db.query<{ id: string }>(
      `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
       values ($1, 'Jack 3.0m', 'JCK30', 200, 45000, 600) returning id`,
      [orgId],
    );
    itemId = item.id;

    const [account] = await db.query<{ id: string }>(
      `insert into accounts (org_id, customer_id, site_name, opened_on)
       values ($1, $2, 'Kakkanad', '2026-06-01') returning id`,
      [orgId, customer.id],
    );
    accountId = account.id;
  }, 60_000);

  afterAll(async () => {
    await db?.close();
  });

  it('produces the same figures as the database view', async () => {
    const rows: Array<[string, number]> = [
      ['ISSUE', 100],
      ['ISSUE', 50],
      ['RETURN', 30],
      ['RETURN_DAMAGED', 4],
      ['LOST', 6],
    ];

    const inserted: AvailabilityMovement[] = [];

    for (const [type, qty] of rows) {
      const [row] = await db.query<{ id: string }>(
        `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot,
                                replacement_snapshot, moved_at, client_uuid)
         values ($1, $2, $3, $4, $5, 200, 45000, '2026-06-10', $6) returning id`,
        [orgId, accountId, itemId, type, qty, `mirror-${type}-${qty}`],
      );
      inserted.push({
        id: row.id,
        itemId,
        type: type as AvailabilityMovement['type'],
        qty,
      });
    }

    // And one issue that is reversed, which neither side should count.
    const [doomed] = await db.query<{ id: string }>(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot,
                              replacement_snapshot, moved_at, client_uuid)
       values ($1, $2, $3, 'ISSUE', 25, 200, 45000, '2026-06-11', 'mirror-doomed') returning id`,
      [orgId, accountId, itemId],
    );
    const [reversal] = await db.query<{ id: string }>(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot,
                              replacement_snapshot, moved_at, client_uuid, reverses_id)
       values ($1, $2, $3, 'REVERSAL', 25, 200, 45000, '2026-06-12', 'mirror-reversal', $4)
       returning id`,
      [orgId, accountId, itemId, doomed.id],
    );

    inserted.push({ id: doomed.id, itemId, type: 'ISSUE', qty: 25 });
    inserted.push({ id: reversal.id, itemId, type: 'REVERSAL', qty: 25, reversesId: doomed.id });

    const [view] = await db.query<{
      qty_out: number;
      qty_lost: number;
      qty_available: number;
    }>(`select qty_out, qty_lost, qty_available from v_item_stock where id = $1`, [itemId]);

    const totals = availabilityByItem(inserted).get(itemId)!;

    expect(totals.qtyOut).toBe(view.qty_out);
    expect(totals.qtyLost).toBe(view.qty_lost);
    expect(qtyAvailable(600, totals)).toBe(view.qty_available);
  });
});
