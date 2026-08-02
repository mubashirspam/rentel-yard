/**
 * The General khata — where a lending lands when no site is named.
 *
 * The property that matters: however many times "skip" is tapped, on however
 * many phones, one customer has one General khata. It rides on the same
 * `(org_id, client_uuid)` unique index the sync push uses, with a
 * deterministic key, so the database enforces it rather than a check that
 * two concurrent requests can both pass.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { StaffSession } from '../auth/guard';
import { __setTestDatabase } from '../db/client';
import { createTestDatabase, type TestDatabase } from '../db/harness';
import { defaultAccount } from './service';

const TODAY = '2026-08-01';

let db: TestDatabase;
let session: StaffSession;
let customerId: string;

beforeAll(async () => {
  db = await createTestDatabase();
  __setTestDatabase(db.orm);

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('General Yard') returning id`,
  );
  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role)
     values ($1, 'owner@general.test', 'Owner', 'super_admin') returning id`,
    [org.id],
  );
  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Rahim', '+919846099999') returning id`,
    [org.id],
  );
  customerId = customer.id;

  session = {
    userId: user.id,
    orgId: org.id,
    role: 'super_admin',
    email: 'owner@general.test',
    name: 'Owner',
  };
}, 60_000);

afterAll(async () => {
  __setTestDatabase(null);
  await db?.close();
});

describe('the General khata', () => {
  it('is created on first use and reused ever after', async () => {
    const first = await defaultAccount(session, customerId, TODAY);
    const second = await defaultAccount(session, customerId, TODAY);

    expect(first.siteName).toBe('General');
    expect(first.status).toBe('open');
    expect(second.id).toBe(first.id);

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from accounts where customer_id = $1`,
      [customerId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('reopens quietly if it was closed — the customer came back', async () => {
    const account = await defaultAccount(session, customerId, TODAY);
    await db.query(`update accounts set status = 'closed', closed_on = $2 where id = $1`, [
      account.id,
      TODAY,
    ]);

    const again = await defaultAccount(session, customerId, TODAY);

    expect(again.id).toBe(account.id);
    expect(again.status).toBe('open');
    expect(again.closedOn).toBeNull();
  });

  it('does not collide with a named site the customer also has', async () => {
    await db.query(
      `insert into accounts (org_id, customer_id, site_name, opened_on)
       values ($1, $2, 'Kakkanad flats', $3)`,
      [session.orgId, customerId, TODAY],
    );

    const general = await defaultAccount(session, customerId, TODAY);
    expect(general.siteName).toBe('General');

    const rows = await db.query<{ n: number }>(
      `select count(*)::int as n from accounts where customer_id = $1`,
      [customerId],
    );
    expect(rows[0].n).toBe(2);
  });
});
