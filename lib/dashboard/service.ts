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

import { and, eq, sql } from 'drizzle-orm';

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

  /*
   * The money in four numbers, because "how much have we billed and how much
   * has actually come in" is the question an owner opens the app to answer.
   * Billed and received are facts from the bills and payments tables; not-yet
   * billed is derived, and is what makes the four reconcile.
   */
  /** Paise frozen into invoices, ever. */
  billed: number;
  /** Paise accrued but on no invoice yet — rent still running, mostly. */
  notBilled: number;
  /** Paise actually received. */
  received: number;
  /** Paise invoiced and still owed. */
  notReceived: number;
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
  customerId: string;
  customerName: string;
  siteName: string;
  /** Paise owed on the account right now. */
  balance: number;
  qtyOut: number;
  /** Paise per day everything out is accruing at. */
  perDay: number;
}

/**
 * One contractor and every site they have open.
 *
 * A yard thinks in people first — "what has Ibrahim got out?" — and a flat list
 * of sites makes that a scanning exercise when a contractor holds three.
 */
export interface ActiveCustomer {
  customerId: string;
  customerName: string;
  sites: ActiveSite[];
  /** Paise owed across all their open sites. */
  balance: number;
  qtyOut: number;
  perDay: number;
}

/** Today's movements for one site, so the dashboard reads as gate passes. */
export interface TodaySite {
  accountId: string;
  customerName: string;
  siteName: string;
  out: Array<{ itemName: string; qty: number }>;
  back: Array<{ itemName: string; qty: number; condition: 'good' | 'damaged' | 'lost' }>;
  gatePasses: string[];
}

export interface DashboardData {
  asOf: string;
  totals: DashboardTotals;
  /** Movements dated today, grouped by the site they belong to (§08.1). */
  today: TodaySite[];
  /** Every open site, biggest balance first — the home screen's working list. */
  /** Open sites, gathered under the contractor who holds them. */
  activeSites: ActiveCustomer[];
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

  const [config, ledgers, items, stock, todayMovements, overdue, money] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadLedgers(
      database,
      accounts.map((account) => account.id),
    ),
    loadItemNames(session.orgId),
    listStock(session),
    loadTodayMovements(session.orgId, asOf),
    listOverdueBills(session, asOf),
    orgMoneyTotals(session.orgId),
  ]);

  let accruedOnOpenAccounts = 0;
  const totals: DashboardTotals = {
    openAccounts: accounts.length,
    outstanding: 0,
    qtyOut: 0,
    billed: money.billed,
    notBilled: 0,
    received: money.received,
    notReceived: Math.max(0, money.billed - money.allocated),
  };
  const longHeld: LongHeldLot[] = [];
  const activeSites: ActiveSite[] = [];
  const balanceByCustomer = new Map<string, number>();

  for (const account of accounts) {
    const ledger = ledgers.get(account.id)!;
    const accrual = accrue(ledger.movements, config, asOf);
    const { balance } = computeBalance({ accrual, ...ledger });

    const accountQtyOut = Object.values(accrual.outstanding).reduce((sum, qty) => sum + qty, 0);

    totals.outstanding += balance;
    accruedOnOpenAccounts += accrual.rentTotal + accrual.damageTotal;
    totals.qtyOut += accountQtyOut;
    // Only sites with equipment out. A completed site still counts in the
    // totals above — its balance is real — but the working list is what is
    // physically in the field; the rest is Accounts → All.
    if (accountQtyOut > 0) {
      activeSites.push({
        accountId: account.id,
        customerId: account.customerId,
        customerName: account.customerName,
        siteName: account.siteName,
        balance,
        qtyOut: accountQtyOut,
        perDay: accrual.openLots.reduce((sum, lot) => sum + lot.qty * lot.ratePerDay, 0),
      });
    }
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

  // Accrued but uninvoiced. Clamped at zero: a yard that has billed ahead of
  // the accrual (a minimum charge, a manual adjustment) should read "nothing
  // pending", not a negative.
  totals.notBilled = Math.max(0, accruedOnOpenAccounts - money.billed + money.billedOnClosed);

  return {
    asOf,
    totals,
    today: groupBySite(todayMovements),
    activeSites: byCustomer(activeSites),
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

/**
 * Org-wide money, straight from the two tables that record it.
 *
 * Kept apart from the per-account replay above: these are sums of what was
 * frozen and what was received, and neither is derived from the ledger.
 */
async function orgMoneyTotals(orgId: string): Promise<{
  billed: number;
  allocated: number;
  received: number;
  billedOnClosed: number;
}> {
  const database = db();

  const [bills, allocations, payments, closed] = await Promise.all([
    database
      .select({ total: sql<number>`coalesce(sum(${schema.bills.grandTotal}), 0)::bigint` })
      .from(schema.bills)
      .where(eq(schema.bills.orgId, orgId)),
    database
      .select({ total: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)::bigint` })
      .from(schema.paymentAllocations)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAllocations.paymentId))
      .where(eq(schema.payments.orgId, orgId)),
    database
      .select({ total: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::bigint` })
      .from(schema.payments)
      .where(eq(schema.payments.orgId, orgId)),
    // Bills against sites that are already closed — their accrual is no longer
    // in `accruedOnOpenAccounts`, so it must come off the comparison too.
    database
      .select({ total: sql<number>`coalesce(sum(${schema.bills.grandTotal}), 0)::bigint` })
      .from(schema.bills)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.bills.accountId))
      .where(and(eq(schema.bills.orgId, orgId), eq(schema.accounts.status, 'closed'))),
  ]);

  return {
    billed: Number(bills[0]?.total ?? 0),
    allocated: Number(allocations[0]?.total ?? 0),
    received: Number(payments[0]?.total ?? 0),
    billedOnClosed: Number(closed[0]?.total ?? 0),
  };
}

/**
 * One card per site, with what went out and what came back.
 *
 * A flat list of movements makes an admin do the grouping in their head — "was
 * that the same lorry?" — when the yard's own unit of work is the site, and
 * within it the gate pass.
 */
function groupBySite(movements: TodayMovement[]): TodaySite[] {
  const sites = new Map<string, TodaySite>();

  for (const movement of movements) {
    const site = sites.get(movement.accountId) ?? {
      accountId: movement.accountId,
      customerName: movement.customerName,
      siteName: movement.siteName,
      out: [],
      back: [],
      gatePasses: [],
    };

    if (movement.type === 'ISSUE') {
      site.out.push({ itemName: movement.itemName, qty: movement.qty });
    } else if (movement.type !== 'REVERSAL') {
      site.back.push({
        itemName: movement.itemName,
        qty: movement.qty,
        condition:
          movement.type === 'LOST' ? 'lost' : movement.type === 'RETURN_DAMAGED' ? 'damaged' : 'good',
      });
    }

    if (movement.gatePassNo && !site.gatePasses.includes(movement.gatePassNo)) {
      site.gatePasses.push(movement.gatePassNo);
    }

    sites.set(movement.accountId, site);
  }

  // Lending before collections: a yard's day runs that way.
  return [...sites.values()].sort((a, b) => b.out.length - a.out.length);
}

/** Gather sites under their contractor, biggest balance first. */
function byCustomer(sites: ActiveSite[]): ActiveCustomer[] {
  const customers = new Map<string, ActiveCustomer>();

  for (const site of sites) {
    const existing = customers.get(site.customerId) ?? {
      customerId: site.customerId,
      customerName: site.customerName,
      sites: [],
      balance: 0,
      qtyOut: 0,
      perDay: 0,
    };

    existing.sites.push(site);
    existing.balance += site.balance;
    existing.qtyOut += site.qtyOut;
    existing.perDay += site.perDay;

    customers.set(site.customerId, existing);
  }

  for (const customer of customers.values()) {
    // Within a contractor, the site with most out is the one being asked about.
    customer.sites.sort((a, b) => b.qtyOut - a.qtyOut || b.balance - a.balance);
  }

  return [...customers.values()].sort((a, b) => b.balance - a.balance);
}
