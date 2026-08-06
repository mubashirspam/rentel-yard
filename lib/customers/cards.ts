/**
 * The contractor card, for every contractor — one shape, one query wave.
 *
 * Home and Customers show the same card, and before the redesign they showed
 * two different things: the dashboard listed *open sites* grouped under a name,
 * `/accounts` listed *khatas* split billed / not billed. Two lists of the same
 * people, disagreeing about what each of them owed, because each derived it its
 * own way. So the card's facts are derived once, here.
 *
 * Closed accounts count. Closing a site means the equipment came back, not that
 * the bill was paid — and a finished site carrying uninvoiced rent is precisely
 * the thing the *to bill* chip exists to surface. That was `/accounts`' whole
 * reason for being, and it survives as this figure.
 *
 * Bulk throughout (D34): `listAccounts` replays every ledger in one pass per
 * table, and the pending-on-bills figure is a single grouped query. A yard with
 * four hundred khatas costs the same handful of round trips as one with four.
 */

import { listAccounts } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { pendingOnBillsByAccount } from '../bills/service';

export interface CustomerCardFacts {
  customerId: string;
  customerName: string;
  customerMobile: string;
  /** Paise owed across every site, open and closed. */
  balance: number;
  /** Units out across every site. */
  qtyOut: number;
  /** Paise per day everything out is accruing at. */
  perDay: number;
  /** Sites currently holding equipment. */
  sitesOut: number;
  /** Sites on the books, ever. */
  siteCount: number;
  /**
   * Paise accrued that no invoice covers, summed over their sites.
   *
   * Per site rather than on the total, and clamped at zero per site, so a job
   * billed slightly ahead cannot quietly cancel out another job that genuinely
   * needs an invoice.
   */
  unbilled: number;
}

export async function listCustomerCards(
  session: StaffSession,
  asOf: string,
): Promise<CustomerCardFacts[]> {
  const accounts = await listAccounts(session, { status: 'all' }, asOf);
  const pending = await pendingOnBillsByAccount(
    session,
    accounts.map((account) => account.id),
  );

  const byCustomer = new Map<string, CustomerCardFacts>();

  for (const account of accounts) {
    const card = byCustomer.get(account.customerId) ?? {
      customerId: account.customerId,
      customerName: account.customerName,
      customerMobile: account.customerMobile,
      balance: 0,
      qtyOut: 0,
      perDay: 0,
      sitesOut: 0,
      siteCount: 0,
      unbilled: 0,
    };

    card.balance += account.balance;
    card.qtyOut += account.qtyOut;
    card.perDay += account.perDay;
    card.siteCount += 1;
    if (account.qtyOut > 0) card.sitesOut += 1;
    card.unbilled += Math.max(0, account.balance - (pending.get(account.id) ?? 0));

    byCustomer.set(account.customerId, card);
  }

  /*
   * Whoever needs doing something about, first: equipment in the field before
   * money on paper, and within each the biggest number. A yard works its way
   * down this list.
   */
  return [...byCustomer.values()].sort(
    (a, b) =>
      Number(b.sitesOut > 0) - Number(a.sitesOut > 0) ||
      b.unbilled - a.unbilled ||
      b.balance - a.balance,
  );
}
