/**
 * The dashboard (§08.1) — "out today, due today, overdue, low stock".
 *
 * Overdue is bill-driven now that bills exist: `listOverdueBills` is the §09
 * reminder queue, and nothing is sent from it automatically — an admin taps
 * through one WhatsApp at a time. Alongside it the screen keeps the two
 * ledger-derived warnings that need no invoice: who is over their agreed credit
 * limit, and what has been sitting on a site for months.
 *
 * Everything here is one replay per open account over bulk-loaded ledgers, so
 * the whole screen costs a handful of queries rather than one per account.
 */

import { and, eq } from 'drizzle-orm';

import { accrue, computeBalance } from '../accrual';
import { loadBillingConfig, loadLedgers } from '../accounts/repository';
import type { StaffSession } from '../auth/guard';
import { listOverdueBills } from '../bills/service';
import { db, schema } from '../db/client';
import { listStock, type StockRow } from '../stock/service';

/**
 * Equipment out longer than this is worth an admin's attention. A placeholder
 * for a real due date, which needs bills (M4) — deliberately generous, so it
 * flags forgotten sites rather than ordinary jobs.
 */
export const LONG_HELD_DAYS = 60;

export interface DashboardTotals {
  openAccounts: number;
  /** Paise owed across every open account. */
  outstanding: number;
  /** Units out across the whole yard. */
  qtyOut: number;
}

export interface TodayMovement {
  type: string;
  qty: number;
  itemName: string;
  customerName: string;
  siteName: string;
  accountId: string;
  gatePassNo: string | null;
}

export interface OverLimitCustomer {
  customerId: string;
  customerName: string;
  mobile: string;
  balance: number;
  creditLimit: number;
}

export interface LongHeldLot {
  accountId: string;
  customerName: string;
  siteName: string;
  itemName: string;
  qty: number;
  since: string;
  daysHeld: number;
}

export interface ActiveSite {
  accountId: string;
  customerName: string;
  siteName: string;
  /** Paise owed on the account right now. */
  balance: number;
  qtyOut: number;
  /** Paise per day everything out is accruing at. */
  perDay: number;
}

export interface DashboardData {
  asOf: string;
  totals: DashboardTotals;
  /** Movements dated today, newest gate pass first (§08.1 "out today"). */
  today: TodayMovement[];
  /** Every open site, biggest balance first — the home screen's working list. */
  activeSites: ActiveSite[];
  /** Bills past their due date with money still owed (§09 reminder queue). */
  overdue: Awaited<ReturnType<typeof listOverdueBills>>;
  overLimit: OverLimitCustomer[];
  longHeld: LongHeldLot[];
  /** Availability below zero — two devices oversold offline (§07.4). */
  negativeStock: StockRow[];
  lowStock: StockRow[];
}

export async function getDashboard(
  session: StaffSession,
  asOf: string,
): Promise<DashboardData> {
  const database = db();

  const accounts = await database
    .select({
      id: schema.accounts.id,
      siteName: schema.accounts.siteName,
      customerId: schema.customers.id,
      customerName: schema.customers.name,
      mobile: schema.customers.mobile,
      creditLimit: schema.customers.creditLimit,
    })
    .from(schema.accounts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .where(and(eq(schema.accounts.orgId, session.orgId), eq(schema.accounts.status, 'open')));

  const [config, ledgers, items, stock, todayMovements, overdue] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadLedgers(
      database,
      accounts.map((account) => account.id),
    ),
    loadItemNames(session.orgId),
    listStock(session),
    loadTodayMovements(session.orgId, asOf),
    listOverdueBills(session, asOf),
  ]);

  const totals: DashboardTotals = { openAccounts: accounts.length, outstanding: 0, qtyOut: 0 };
  const longHeld: LongHeldLot[] = [];
  const activeSites: ActiveSite[] = [];
  const balanceByCustomer = new Map<string, number>();

  for (const account of accounts) {
    const ledger = ledgers.get(account.id)!;
    const accrual = accrue(ledger.movements, config, asOf);
    const { balance } = computeBalance({ accrual, ...ledger });

    const accountQtyOut = Object.values(accrual.outstanding).reduce((sum, qty) => sum + qty, 0);

    totals.outstanding += balance;
    totals.qtyOut += accountQtyOut;
    activeSites.push({
      accountId: account.id,
      customerName: account.customerName,
      siteName: account.siteName,
      balance,
      qtyOut: accountQtyOut,
      perDay: accrual.openLots.reduce((sum, lot) => sum + lot.qty * lot.ratePerDay, 0),
    });
    balanceByCustomer.set(
      account.customerId,
      (balanceByCustomer.get(account.customerId) ?? 0) + balance,
    );

    for (const lot of accrual.openLots) {
      if (lot.daysHeld < LONG_HELD_DAYS) continue;
      longHeld.push({
        accountId: account.id,
        customerName: account.customerName,
        siteName: account.siteName,
        itemName: items.get(lot.itemId) ?? 'Unknown item',
        qty: lot.qty,
        since: lot.from,
        daysHeld: lot.daysHeld,
      });
    }
  }

  // One entry per customer, not per site — the limit is agreed with the person.
  const overLimit: OverLimitCustomer[] = [];
  const seen = new Set<string>();
  for (const account of accounts) {
    if (seen.has(account.customerId)) continue;
    seen.add(account.customerId);

    const balance = balanceByCustomer.get(account.customerId) ?? 0;
    if (account.creditLimit <= 0 || balance <= account.creditLimit) continue;

    overLimit.push({
      customerId: account.customerId,
      customerName: account.customerName,
      mobile: account.mobile,
      balance,
      creditLimit: account.creditLimit,
    });
  }

  return {
    asOf,
    totals,
    today: todayMovements,
    activeSites: activeSites.sort((a, b) => b.balance - a.balance),
    overdue,
    overLimit: overLimit.sort((a, b) => b.balance - a.balance),
    longHeld: longHeld.sort((a, b) => b.daysHeld - a.daysHeld).slice(0, 10),
    negativeStock: stock.filter((row) => row.isNegative),
    lowStock: stock.filter((row) => row.isLow),
  };
}

async function loadItemNames(orgId: string): Promise<Map<string, string>> {
  const rows = await db()
    .select({ id: schema.items.id, name: schema.items.name })
    .from(schema.items)
    .where(eq(schema.items.orgId, orgId));

  return new Map(rows.map((row) => [row.id, row.name]));
}

/** What left and came back today, for the top of the dashboard. */
async function loadTodayMovements(orgId: string, asOf: string): Promise<TodayMovement[]> {
  return db()
    .select({
      type: schema.movements.type,
      qty: schema.movements.qty,
      itemName: schema.items.name,
      customerName: schema.customers.name,
      siteName: schema.accounts.siteName,
      accountId: schema.accounts.id,
      gatePassNo: schema.movements.gatePassNo,
    })
    .from(schema.movements)
    .innerJoin(schema.items, eq(schema.items.id, schema.movements.itemId))
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.movements.accountId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .where(and(eq(schema.movements.orgId, orgId), eq(schema.movements.movedAt, asOf)));
}
