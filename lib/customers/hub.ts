/**
 * Everything one contractor's screen needs, in one call.
 *
 * The redesign's data shape. A contractor's story used to be assembled from
 * four screens — the dashboard's active sites, `/accounts`' billed/unbilled
 * split, `/accounts/[id]`'s per-site money, `/customers/[id]`'s profile — and
 * each of them went to the database for its own slice of the same person. One
 * screen now asks all four questions, so one function answers them.
 *
 * The four questions, which are the screen's four tabs:
 *
 *   1. **Out now** — what is on a site right now, per site.
 *   2. **To bill** — what has accrued that no invoice covers, per site.
 *   3. **Billed** — every invoice across every site, and what is owed on it.
 *   4. **Returned** — sites holding nothing: finished work, as history.
 *
 * Everything here is bulk. `getCustomerSites` already replays every khata's
 * ledger in one pass per table (D34), and the two bill queries take arrays, so
 * a contractor with eight sites costs the same round trips as one with a
 * single site. In particular this does **not** call `getMoneySummary` per
 * site — that is six queries each, and the figure it is wanted for
 * (accrued-but-unbilled) is derivable from data already in hand.
 */

import { loadBillingConfig } from '../accounts/repository';
import { getCustomerSites, type CustomerSite } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { listBillsForAccounts, type BillSummary } from '../bills/service';
import { db, schema } from '../db/client';
import { and, eq } from 'drizzle-orm';
import { ERROR_CODES, LedgerError } from '../errors';

/** One khata, with the money questions answered alongside the equipment ones. */
export interface HubSite extends CustomerSite {
  /**
   * Paise accrued on this site that no invoice covers.
   *
   * Derived the way `getMoneySummary` derives it — the balance less what is
   * still owed on issued bills — so the two can never disagree. Never negative:
   * a yard may bill ahead of the accrual, and "minus ₹200 to bill" is not a
   * thing anybody can act on.
   */
  unbilled: number;
  /** Paise frozen into invoices on this site, ever. */
  billed: number;
  /** Paise still owed on this site's invoices. */
  pendingOnBills: number;
  bills: BillSummary[];
}

export interface CustomerHub {
  customer: typeof schema.customers.$inferSelect;
  sites: HubSite[];
  totals: {
    /** Paise owed across every site, open and closed. */
    balance: number;
    qtyOut: number;
    perDay: number;
    unbilled: number;
    pendingOnBills: number;
    siteCount: number;
    openSites: number;
    /** Sites actually holding equipment — what "out now" counts. */
    sitesOut: number;
  };
  /** Owes more than their agreed limit. A zero limit means no limit. */
  overCreditLimit: boolean;
  /** The yard's minimum billing days, for the tables that price a short hire. */
  minimumDays: number;
}

export async function getCustomerHub(
  session: StaffSession,
  customerId: string,
  asOf: string,
): Promise<CustomerHub> {
  const database = db();

  const [customer] = await database
    .select()
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, session.orgId)))
    .limit(1);

  // Cross-org rows are 404, not 403 (D22) — the caller turns this into one.
  if (!customer) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That customer was not found.');

  const { sites, totals } = await getCustomerSites(session, customerId, asOf);
  const [bills, config] = await Promise.all([
    listBillsForAccounts(
      session,
      sites.map((site) => site.accountId),
      asOf,
    ),
    loadBillingConfig(database, session.orgId),
  ]);

  const hubSites: HubSite[] = sites.map((site) => {
    const siteBills = bills.get(site.accountId) ?? [];
    const billed = siteBills.reduce((sum, bill) => sum + bill.rentTotal + bill.damageTotal, 0);
    const pendingOnBills = siteBills.reduce((sum, bill) => sum + bill.outstanding, 0);

    return {
      ...site,
      billed,
      pendingOnBills,
      unbilled: Math.max(0, site.balance - pendingOnBills),
      bills: siteBills,
    };
  });

  const sum = (pick: (site: HubSite) => number) =>
    hubSites.reduce((total, site) => total + pick(site), 0);

  return {
    customer,
    sites: hubSites,
    totals: {
      ...totals,
      unbilled: sum((site) => site.unbilled),
      pendingOnBills: sum((site) => site.pendingOnBills),
      sitesOut: hubSites.filter((site) => site.qtyOut > 0).length,
    },
    overCreditLimit: customer.creditLimit > 0 && totals.balance > customer.creditLimit,
    minimumDays: config.minimum_days,
  };
}
