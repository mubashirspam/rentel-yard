/**
 * §06 `GET /api/bootstrap` — "everything the offline client caches on first
 * load: items, customers, open accounts, settings, server time, sync cursor".
 *
 * One request, so a device set up in the yard office is usable by the time it
 * reaches the gate. Movements come with the open accounts, because a return
 * cannot be validated locally without the lots it consumes.
 */

import { and, eq, inArray } from 'drizzle-orm';

import { loadBillingConfig } from '../accounts/repository';
import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import { listStock } from '../stock/service';
import { currentCursor } from './pull';

export interface BootstrapPayload {
  serverTime: string;
  cursor: number;
  org: { id: string; name: string };
  settings: {
    billing: Awaited<ReturnType<typeof loadBillingConfig>>;
    /** The device shows availability, so it needs to know what "low" means. */
    yardPhone: string | null;
  };
  items: Awaited<ReturnType<typeof listStock>>;
  customers: Array<typeof schema.customers.$inferSelect>;
  accounts: Array<typeof schema.accounts.$inferSelect>;
  /** Movements for the open accounts only — enough to replay them offline. */
  movements: Array<typeof schema.movements.$inferSelect>;
}

export async function getBootstrap(session: StaffSession): Promise<BootstrapPayload> {
  const database = db();
  const org = session.orgId;

  const [cursor, orgRow, billing, items, customers, accounts, settings] = await Promise.all([
    currentCursor(session),
    database
      .select({ id: schema.orgs.id, name: schema.orgs.name })
      .from(schema.orgs)
      .where(eq(schema.orgs.id, org))
      .limit(1),
    loadBillingConfig(database, org),
    listStock(session),
    database.select().from(schema.customers).where(eq(schema.customers.orgId, org)),
    database
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.orgId, org), eq(schema.accounts.status, 'open'))),
    database
      .select({ yardPhone: schema.settings.yardPhone })
      .from(schema.settings)
      .where(eq(schema.settings.orgId, org))
      .limit(1),
  ]);

  const accountIds = accounts.map((account) => account.id);

  const movements =
    accountIds.length === 0
      ? []
      : await database
          .select()
          .from(schema.movements)
          .where(inArray(schema.movements.accountId, accountIds));

  return {
    serverTime: new Date().toISOString(),
    cursor,
    org: orgRow[0] ?? { id: org, name: 'Yard Ledger' },
    settings: { billing, yardPhone: settings[0]?.yardPhone ?? null },
    items,
    customers,
    accounts,
    movements,
  };
}
