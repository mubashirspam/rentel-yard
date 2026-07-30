/**
 * Schema tests against a real Postgres, running the committed migrations.
 *
 * These exist because §00's rules are only as strong as their enforcement. A
 * comment saying "append-only" stops nobody; a trigger does.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from './harness';

let db: TestDatabase;

/** Ids for a fixture yard: one org, one customer, one item, one account. */
const ids = {
  org: '',
  customer: '',
  item: '',
  account: '',
  user: '',
};

beforeAll(async () => {
  db = await createTestDatabase();

  const [org] = await db.query<{ id: string }>(
    `insert into orgs (name) values ('Test Yard') returning id`,
  );
  ids.org = org.id;

  const [user] = await db.query<{ id: string }>(
    `insert into users (org_id, email, name, role) values ($1, 'owner@test', 'Owner', 'super_admin') returning id`,
    [ids.org],
  );
  ids.user = user.id;

  const [customer] = await db.query<{ id: string }>(
    `insert into customers (org_id, name, mobile) values ($1, 'Contractor', '+919846012345') returning id`,
    [ids.org],
  );
  ids.customer = customer.id;

  const [item] = await db.query<{ id: string }>(
    `insert into items (org_id, name, code, rate_per_day, replacement_rate, qty_owned)
     values ($1, 'Jack 3.0m', 'JCK30', 200, 45000, 600) returning id`,
    [ids.org],
  );
  ids.item = item.id;

  const [account] = await db.query<{ id: string }>(
    `insert into accounts (org_id, customer_id, site_name, opened_on)
     values ($1, $2, 'Kakkanad site', '2026-01-01') returning id`,
    [ids.org, ids.customer],
  );
  ids.account = account.id;
}, 60_000);

afterAll(async () => {
  await db?.close();
});

async function insertMovement(
  overrides: Partial<{ type: string; qty: number; movedAt: string; clientUuid: string }> = {},
): Promise<string> {
  const {
    type = 'ISSUE',
    qty = 10,
    movedAt = '2026-01-01',
    clientUuid = `cu-${Math.random().toString(36).slice(2)}`,
  } = overrides;

  const [row] = await db.query<{ id: string }>(
    `insert into movements
       (org_id, account_id, item_id, type, qty, rate_snapshot, replacement_snapshot, moved_at, client_uuid, created_by)
     values ($1, $2, $3, $4, $5, 200, 45000, $6, $7, $8)
     returning id`,
    [ids.org, ids.account, ids.item, type, qty, movedAt, clientUuid, ids.user],
  );

  return row.id;
}

describe('migrations', () => {
  it('creates every §04 table', async () => {
    const rows = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    const tables = rows.map((r) => r.table_name);

    expect(tables).toEqual([
      'accounts',
      'adjustments',
      'auth_accounts',
      'auth_sessions',
      'auth_verifications',
      'bills',
      'customers',
      'items',
      'movements',
      'orgs',
      'payment_allocations',
      'payments',
      'portal_lookups',
      'portal_tokens',
      'settings',
      'sync_rejections',
      'users',
    ]);
  });

  it('gives every business table an org_id (§00 rule 6)', async () => {
    // Multi-tenancy must never need a migration. `orgs` is the tenant itself;
    // payment_allocations is a join table reached only through its parents; the
    // auth_* tables belong to Better Auth and hang off users.
    const exempt = new Set([
      'orgs',
      'payment_allocations',
      'auth_sessions',
      'auth_accounts',
      'auth_verifications',
    ]);

    const rows = await db.query<{ table_name: string }>(
      `select t.table_name from information_schema.tables t
       where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
         and not exists (
           select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = t.table_name
             and c.column_name = 'org_id'
         )
       order by t.table_name`,
    );

    expect(rows.map((r) => r.table_name).filter((name) => !exempt.has(name))).toEqual([]);
  });

  it('stores every money column as bigint (§00 rule 3)', async () => {
    // `show_rates_to_customer` and `portal_token_days` match the name pattern
    // but are a flag and a day count, not amounts.
    const rows = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public'
         and (column_name like '%amount%' or column_name like '%total%'
              or column_name like '%rate%' or column_name like '%charge%'
              or column_name in ('credit_limit', 'purchase_cost'))
         and column_name not in ('show_rates_to_customer', 'portal_token_days')
       order by table_name, column_name`,
    );

    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.data_type, `${row.table_name}.${row.column_name}`).toBe('bigint');
    }
  });

  it('stores every rent date as date, not timestamp (§00 rule 4)', async () => {
    const rows = await db.query<{ table_name: string; column_name: string; data_type: string }>(
      `select table_name, column_name, data_type from information_schema.columns
       where table_schema = 'public'
         and column_name in ('moved_at', 'paid_on', 'applied_on', 'opened_on',
                             'closed_on', 'period_from', 'period_to', 'due_on')`,
    );

    expect(rows.length).toBe(8);
    for (const row of rows) {
      expect(row.data_type, `${row.table_name}.${row.column_name}`).toBe('date');
    }
  });
});

describe('§00 rule 1 — movements is append-only', () => {
  it('refuses to delete a movement', async () => {
    const id = await insertMovement();
    const message = await db.expectRejection('delete from movements where id = $1', [id]);
    expect(message).toContain('append-only');
    expect(message).toContain('REVERSAL');

    const [still] = await db.query('select id from movements where id = $1', [id]);
    expect(still).toBeDefined();
  });

  it('refuses to change a quantity', async () => {
    const id = await insertMovement({ qty: 10 });
    const message = await db.expectRejection('update movements set qty = 99 where id = $1', [id]);
    expect(message).toContain('append-only');

    const [row] = await db.query<{ qty: number }>('select qty from movements where id = $1', [id]);
    expect(row.qty).toBe(10);
  });

  it('refuses to change a rate, a date, or a type', async () => {
    const id = await insertMovement();

    for (const mutation of [
      'update movements set rate_snapshot = 300 where id = $1',
      "update movements set moved_at = '2026-02-01' where id = $1",
      "update movements set type = 'RETURN' where id = $1",
      'update movements set account_id = account_id where id = $1 and false',
    ].slice(0, 3)) {
      expect(await db.expectRejection(mutation, [id])).toContain('append-only');
    }
  });

  it('allows a photo to land later, because offline uploads arrive after the row', async () => {
    // §07.1 queues binaries separately from the movement, so the gate-pass
    // photo genuinely does need to attach after the fact.
    const id = await insertMovement();

    await db.query('update movements set photo_url = $2, signature_url = $3 where id = $1', [
      id,
      'https://r2.example/photo.webp',
      'https://r2.example/sign.webp',
    ]);

    const [row] = await db.query<{ photo_url: string }>(
      'select photo_url from movements where id = $1',
      [id],
    );
    expect(row.photo_url).toBe('https://r2.example/photo.webp');
  });

  it('enforces qty > 0', async () => {
    expect(await db.expectRejection(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot, moved_at, client_uuid)
       values ($1, $2, $3, 'ISSUE', 0, 200, '2026-01-01', 'cu-zero')`,
      [ids.org, ids.account, ids.item],
    )).toContain('movements_qty_check');
  });

  it('absorbs a duplicate submission via (org_id, client_uuid)', async () => {
    // §07.2 step 7: retries are free because the unique constraint catches
    // the second copy of the same device-generated id.
    await insertMovement({ clientUuid: 'cu-fixed' });

    const message = await db.expectRejection(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot, moved_at, client_uuid)
       values ($1, $2, $3, 'ISSUE', 10, 200, '2026-01-01', 'cu-fixed')`,
      [ids.org, ids.account, ids.item],
    );
    expect(message).toContain('movements_org_client_uuid_key');
  });
});

describe('§02 — a bill is immutable once issued', () => {
  it('refuses to update or delete a bill', async () => {
    const [bill] = await db.query<{ id: string }>(
      `insert into bills (org_id, account_id, invoice_no, period_from, period_to,
                          rent_total, grand_total, lines)
       values ($1, $2, 'INV-1', '2026-01-01', '2026-01-31', 60000, 60000, '[]'::jsonb)
       returning id`,
      [ids.org, ids.account],
    );

    expect(await db.expectRejection('update bills set grand_total = 1 where id = $1', [bill.id]))
      .toContain('immutable');
    expect(await db.expectRejection('delete from bills where id = $1', [bill.id]))
      .toContain('immutable');
  });
});

describe('§07.3 — server_seq', () => {
  it('is monotonic across tables, so one cursor orders everything', async () => {
    const [a] = await db.query<{ server_seq: number }>(
      `insert into customers (org_id, name, mobile) values ($1, 'A', '+919000000001') returning server_seq`,
      [ids.org],
    );
    const [b] = await db.query<{ server_seq: number }>(
      `insert into items (org_id, name, code, rate_per_day) values ($1, 'B', 'BBB', 100) returning server_seq`,
      [ids.org],
    );

    expect(Number(b.server_seq)).toBeGreaterThan(Number(a.server_seq));
  });

  it('advances on update, not only on insert', async () => {
    // Without this a device that already synced past the row never sees the
    // edit — the bug would be silent and permanent.
    const [before] = await db.query<{ id: string; server_seq: number }>(
      `insert into customers (org_id, name, mobile) values ($1, 'Before', '+919000000002')
       returning id, server_seq`,
      [ids.org],
    );

    const [after] = await db.query<{ server_seq: number }>(
      `update customers set name = 'After' where id = $1 returning server_seq`,
      [before.id],
    );

    expect(Number(after.server_seq)).toBeGreaterThan(Number(before.server_seq));
  });
});

describe('§04 — v_item_stock', () => {
  /** A fresh item per case, so the fixture movements do not interfere. */
  async function stockFor(
    movements: Array<{ type: string; qty: number }>,
    qtyOwned = 100,
  ): Promise<{ qty_owned: number; qty_out: number; qty_lost: number; qty_available: number }> {
    const code = `IT-${Math.random().toString(36).slice(2, 8)}`;
    const [item] = await db.query<{ id: string }>(
      `insert into items (org_id, name, code, rate_per_day, qty_owned)
       values ($1, $2, $3, 200, $4) returning id`,
      [ids.org, code, code, qtyOwned],
    );

    for (const movement of movements) {
      await db.query(
        `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot, moved_at, client_uuid)
         values ($1, $2, $3, $4, $5, 200, '2026-01-01', $6)`,
        [
          ids.org,
          ids.account,
          item.id,
          movement.type,
          movement.qty,
          `cu-${Math.random().toString(36).slice(2)}`,
        ],
      );
    }

    const [row] = await db.query<{
      qty_owned: number;
      qty_out: number;
      qty_lost: number;
      qty_available: number;
    }>(`select qty_owned, qty_out, qty_lost, qty_available from v_item_stock where id = $1`, [
      item.id,
    ]);

    return row;
  }

  it('reports everything available when nothing has moved', async () => {
    expect(await stockFor([])).toMatchObject({ qty_out: 0, qty_lost: 0, qty_available: 100 });
  });

  it('subtracts issues and adds returns back', async () => {
    expect(await stockFor([{ type: 'ISSUE', qty: 40 }])).toMatchObject({
      qty_out: 40,
      qty_available: 60,
    });

    expect(
      await stockFor([
        { type: 'ISSUE', qty: 40 },
        { type: 'RETURN', qty: 15 },
      ]),
    ).toMatchObject({ qty_out: 25, qty_available: 75 });
  });

  it('treats a damaged return as back in the yard but still owned', async () => {
    expect(
      await stockFor([
        { type: 'ISSUE', qty: 40 },
        { type: 'RETURN_DAMAGED', qty: 10 },
      ]),
    ).toMatchObject({ qty_out: 30, qty_lost: 0, qty_available: 70 });
  });

  it('writes lost units off owned stock entirely (§02)', async () => {
    // 100 owned, 40 went out, 10 of those are never coming back: 30 still out,
    // 10 gone, so only 60 can be issued again.
    expect(
      await stockFor([
        { type: 'ISSUE', qty: 40 },
        { type: 'LOST', qty: 10 },
      ]),
    ).toMatchObject({ qty_owned: 100, qty_out: 30, qty_lost: 10, qty_available: 60 });
  });

  it('goes negative rather than lying, when two devices oversell offline', async () => {
    // §07.4: accept both, the equipment really left the yard, and raise an
    // alert for an admin. A clamped-at-zero number would hide the problem.
    expect(await stockFor([{ type: 'ISSUE', qty: 120 }])).toMatchObject({
      qty_out: 120,
      qty_available: -20,
    });
  });
});

describe('§04 — v_item_stock excludes reversed movements', () => {
  it('restores stock when an issue is reversed (§03.5 vector 7)', async () => {
    const code = `RV-${Math.random().toString(36).slice(2, 8)}`;
    const [item] = await db.query<{ id: string }>(
      `insert into items (org_id, name, code, rate_per_day, qty_owned)
       values ($1, $2, $3, 200, 50) returning id`,
      [ids.org, code, code],
    );

    const [issue] = await db.query<{ id: string }>(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot, moved_at, client_uuid)
       values ($1, $2, $3, 'ISSUE', 10, 200, '2026-01-01', $4) returning id`,
      [ids.org, ids.account, item.id, `cu-${code}-i`],
    );

    const outBefore = await db.query<{ qty_out: number }>(
      'select qty_out from v_item_stock where id = $1',
      [item.id],
    );
    expect(outBefore[0].qty_out).toBe(10);

    await db.query(
      `insert into movements (org_id, account_id, item_id, type, qty, rate_snapshot, moved_at, client_uuid, reverses_id)
       values ($1, $2, $3, 'REVERSAL', 10, 200, '2026-01-03', $4, $5)`,
      [ids.org, ids.account, item.id, `cu-${code}-r`, issue.id],
    );

    const [after] = await db.query<{ qty_out: number; qty_available: number }>(
      'select qty_out, qty_available from v_item_stock where id = $1',
      [item.id],
    );
    expect(after).toMatchObject({ qty_out: 0, qty_available: 50 });
  });
});

describe('roles', () => {
  it('accepts only the two roles that exist', async () => {
    for (const role of ['super_admin', 'admin']) {
      const [row] = await db.query<{ role: string }>(
        `insert into users (org_id, email, name, role) values ($1, $2, 'X', $3) returning role`,
        [ids.org, `${role}@roles.test`, role],
      );
      expect(row.role).toBe(role);
    }
  });

  it('rejects the dropped staff role and anything else', async () => {
    for (const role of ['staff', 'customer', 'owner', '']) {
      const message = await db.expectRejection(
        `insert into users (org_id, email, name, role) values ($1, $2, 'X', $3)`,
        [ids.org, `${role || 'blank'}@bad.test`, role],
      );
      expect(message).toContain('users_role_check');
    }
  });
});

describe('portal access', () => {
  it('stores only a token hash, never a raw token', async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'portal_tokens'`,
    );
    const names = columns.map((c) => c.column_name);

    expect(names).toContain('token_hash');
    expect(names).not.toContain('token');
  });

  it('keeps token hashes globally unique', async () => {
    await db.query(
      `insert into portal_tokens (org_id, customer_id, token_hash, expires_at)
       values ($1, $2, 'hash-one', now() + interval '90 days')`,
      [ids.org, ids.customer],
    );

    const message = await db.expectRejection(
      `insert into portal_tokens (org_id, customer_id, token_hash, expires_at)
       values ($1, $2, 'hash-one', now() + interval '90 days')`,
      [ids.org, ids.customer],
    );
    expect(message).toContain('portal_tokens_token_hash');
  });

  it('accepts both token sources and rejects anything else', async () => {
    for (const source of ['admin_link', 'mobile_lookup']) {
      await db.query(
        `insert into portal_tokens (org_id, customer_id, token_hash, source, expires_at)
         values ($1, $2, $3, $4, now() + interval '1 day')`,
        [ids.org, ids.customer, `hash-${source}`, source],
      );
    }

    expect(
      await db.expectRejection(
        `insert into portal_tokens (org_id, customer_id, token_hash, source, expires_at)
         values ($1, $2, 'hash-bad', 'guessed', now() + interval '1 day')`,
        [ids.org, ids.customer],
      ),
    ).toContain('portal_tokens_source_check');
  });

  it('does not store raw mobile numbers in the lookup audit trail', async () => {
    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'portal_lookups'`,
    );
    const names = columns.map((c) => c.column_name);

    expect(names).toContain('mobile_hash');
    expect(names).not.toContain('mobile');
    expect(names).not.toContain('ip');
  });
});

describe('customers', () => {
  it('keeps one khata per mobile per org (§07.4 merge rule)', async () => {
    const message = await db.expectRejection(
      `insert into customers (org_id, name, mobile) values ($1, 'Duplicate', '+919846012345')`,
      [ids.org],
    );
    expect(message).toContain('customers_org_mobile_key');
  });
});
