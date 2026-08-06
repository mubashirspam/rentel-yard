/**
 * §08.3 fast lending. One page, and it is the form (D65).
 *
 * `/issue` used to open on a list of every site with equipment out, with *New
 * lending* above it — a picker between the tab and the work. That list was the
 * third copy of the same thing: Home shows who is holding what, Customers
 * shows it again, and a contractor's own screen shows it a fourth time with
 * the return links attached. A tab called **Lend** should lend.
 *
 * So the route lands on the form. `?new=1` still works, because it is in
 * saved links and in the manifest's shortcuts; `?account=` still skips
 * straight to the items for a site already chosen; and `?customer=` — how the
 * contractor's own *Lend* button arrives — seeds the picker with their name so
 * their sites are on screen without the app deciding which one.
 */

import { IssueForm, type IssueTarget } from '@/components/domain/issue-form';
import { PageHeader, Screen } from '@/components/ui/layout';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { db, schema } from '@/lib/db/client';
import { ERROR_CODES, isLedgerError } from '@/lib/errors';
import { listStock } from '@/lib/stock/service';
import { WORDS } from '@/lib/vocabulary';
import { and, eq } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { account?: string; customer?: string; new?: string };

export default async function IssuePage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requirePageSession('/issue');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId, customer: customerId } = await searchParams;

  const [stock, target, targets, initialQuery] = await Promise.all([
    listStock(session),
    accountId ? findTarget(session, accountId, asOf) : Promise.resolve(undefined),
    /*
     * Every open khata, rendered into the picker at the top of the form. Sent
     * with the page so choosing a customer and site costs no round trip and no
     * second screen — the whole lending is one page. Skipped only when the
     * site is already decided by the URL.
     */
    accountId ? Promise.resolve([]) : listAccounts(session, { status: 'open' }, asOf),
    customerId ? customerName(session, customerId) : Promise.resolve(undefined),
  ]);

  return (
    <Screen>
      <PageHeader title={`New ${WORDS.lending.toLowerCase()}`} />
      <IssueForm
        items={stock}
        today={asOf}
        initialTarget={target}
        initialQuery={initialQuery}
        targets={targets.map((account) => ({
          accountId: account.id,
          customerId: account.customerId,
          siteName: account.siteName,
          customerName: account.customerName,
          customerMobile: account.customerMobile,
          qtyOut: account.qtyOut,
        }))}
      />
    </Screen>
  );
}

/**
 * The name behind `?customer=`, or nothing.
 *
 * Only the name: it seeds a filter the admin can clear, so an id from another
 * org (D22) or one that no longer exists simply leaves the picker open on
 * everybody rather than raising a 404 on a screen that still works.
 */
async function customerName(
  session: StaffSession,
  customerId: string,
): Promise<string | undefined> {
  const [row] = await db()
    .select({ name: schema.customers.name })
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, session.orgId)))
    .limit(1);

  return row?.name;
}

/**
 * The account named in the URL, or nothing — an unknown id, a closed site, or
 * another org's account (D22) all fall back to the full customer → site flow
 * rather than an error page.
 */
async function findTarget(
  session: StaffSession,
  accountId: string,
  asOf: string,
): Promise<IssueTarget | undefined> {
  const detail = await getAccountDetail(session, accountId, asOf).catch((error: unknown) => {
    if (isLedgerError(error) && error.code === ERROR_CODES.NOT_FOUND) return null;
    throw error;
  });

  if (!detail || detail.account.status !== 'open') return undefined;

  return {
    accountId: detail.account.id,
    siteName: detail.account.siteName,
    customerName: detail.customer.name,
    customerMobile: detail.customer.mobile,
    // What is already on this site. Lending more without seeing it is how a
    // yard sends a second load of jacks to a site that has forty sitting idle.
    outstanding: detail.outstanding.map((line) => ({
      itemName: line.itemName,
      qtyOut: line.qtyOut,
      unit: line.unit,
      since: line.since,
      daysHeld: line.daysHeld,
      accruingPerDay: line.accruingPerDay,
    })),
    balance: detail.balance.balance,
    openedOn: detail.account.openedOn,
  };
}
