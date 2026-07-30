/**
 * Live stock (§01, §04) — read straight from `v_item_stock`, which derives
 * everything from the ledger. Never a stored counter (§00 rule 2).
 */

import { and, asc, eq } from 'drizzle-orm';

import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';

export interface StockRow {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  qtyOwned: number;
  qtyOut: number;
  qtyLost: number;
  qtyAvailable: number;
  /** Paise per unit per day — the issue screen shows a running rent total. */
  ratePerDay: number;
  replacementRate: number;
  isActive: boolean;
  /** Availability is below zero — two devices oversold offline (§07.4). */
  isNegative: boolean;
  /** Under a tenth of what the yard owns, so worth flagging on the dashboard. */
  isLow: boolean;
}

/**
 * Live stock for every item, active or not — a retired item can still be out
 * on a site and has to be returnable.
 */
export async function listStock(
  session: StaffSession,
  options: { activeOnly?: boolean } = {},
): Promise<StockRow[]> {
  const filters = [eq(schema.vItemStock.orgId, session.orgId)];
  if (options.activeOnly) filters.push(eq(schema.items.isActive, true));

  const rows = await db()
    .select({
      id: schema.vItemStock.id,
      name: schema.vItemStock.name,
      code: schema.vItemStock.code,
      unit: schema.vItemStock.unit,
      qtyOwned: schema.vItemStock.qtyOwned,
      qtyOut: schema.vItemStock.qtyOut,
      qtyLost: schema.vItemStock.qtyLost,
      qtyAvailable: schema.vItemStock.qtyAvailable,
      ratePerDay: schema.items.ratePerDay,
      replacementRate: schema.items.replacementRate,
      isActive: schema.items.isActive,
    })
    .from(schema.vItemStock)
    .innerJoin(schema.items, eq(schema.items.id, schema.vItemStock.id))
    .where(and(...filters))
    .orderBy(asc(schema.items.sortOrder), asc(schema.vItemStock.name));

  return rows.map((row) => ({
    ...row,
    isNegative: row.qtyAvailable < 0,
    isLow: row.qtyAvailable >= 0 && row.qtyOwned > 0 && row.qtyAvailable * 10 < row.qtyOwned,
  }));
}

/** Where one item is right now: which accounts hold it, and for how long (§10). */
export async function itemWhereabouts(session: StaffSession, itemId: string) {
  return db()
    .select({
      accountId: schema.accounts.id,
      siteName: schema.accounts.siteName,
      customerName: schema.customers.name,
      customerMobile: schema.customers.mobile,
    })
    .from(schema.accounts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .innerJoin(schema.movements, eq(schema.movements.accountId, schema.accounts.id))
    .where(eq(schema.movements.itemId, itemId))
    .groupBy(
      schema.accounts.id,
      schema.accounts.siteName,
      schema.customers.name,
      schema.customers.mobile,
    );
}
