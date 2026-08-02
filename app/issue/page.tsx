/**
 * §08.3 fast issue. Arriving with `?account=` skips straight to the items.
 */

import Link from 'next/link';

import { IssueForm, type IssueTarget } from '@/components/domain/issue-form';
import { SiteBrowser } from '@/components/domain/site-browser';
import { PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { ERROR_CODES, isLedgerError } from '@/lib/errors';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { account?: string; new?: string };

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requirePageSession('/issue');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId, new: startNew } = await searchParams;

  // Without an explicit target, /issue is the live list of rentals out on
  // hire — the picker flow is one tap away on "New issue".
  if (!accountId && startNew === undefined) {
    return <ActiveRentals session={session} />;
  }

  const [stock, target, targets] = await Promise.all([
    listStock(session),
    accountId ? findTarget(session, accountId, asOf) : Promise.resolve(undefined),
    // Every open khata, rendered into the picker at the top of the form. Sent
    // with the page so choosing a customer and site costs no round trip and no
    // second screen — the whole lending is one page.
    accountId ? Promise.resolve([]) : listAccounts(session, { status: 'open' }, asOf),
  ]);

  return (
    <Screen>
      <PageHeader
        title="New lending"
        back={{ href: '/issue', label: 'Lending' }}
      />
      <IssueForm
        items={stock}
        today={asOf}
        initialTarget={target}
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

/** Every site with equipment on hire — searched and filtered on the device. */
async function ActiveRentals({ session }: { session: StaffSession }) {
  // Only sites actually holding equipment: this screen answers "who has our
  // stock and might want more", and a fully-returned site is noise here — it
  // lives under Accounts → All.
  const rows = (await listAccounts(session, { status: 'open' }, today())).filter(
    (account) => account.qtyOut > 0,
  );

  return (
    <Screen>
      <PageHeader title="Lending" />

      <Link
        href="/issue?new=1"
        className="tap mb-4 flex items-center justify-center gap-1.5 rounded-xl bg-steel px-3 font-semibold text-white hover:bg-steel-strong"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        New lending
      </Link>

      <SectionTitle tone="amber">Lending out now</SectionTitle>

      <SiteBrowser
        rows={rows}
        hrefPrefix="/issue?account="
        emptyTitle="Nothing is out on hire"
        emptyBody="Every item the yard owns is on the racks. Start a lending and the site appears here."
        emptyAction={
          <Link
            href="/issue?new=1"
            className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white"
          >
            New lending
          </Link>
        }
      />
    </Screen>
  );
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
