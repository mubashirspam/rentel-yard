/**
 * §08.3 fast issue. Arriving with `?account=` skips straight to the items.
 */

import Link from 'next/link';

import { IssueForm, type IssueTarget } from '@/components/domain/issue-form';
import { Chip, EmptyState, List, PageHeader, RowLink, Screen, SectionTitle } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { ERROR_CODES, isLedgerError } from '@/lib/errors';
import { formatDays } from '@/lib/format';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { account?: string; new?: string; q?: string };

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requirePageSession('/issue');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId, new: startNew, q } = await searchParams;

  // Without an explicit target, /issue is the live list of rentals out on
  // hire — the picker flow is one tap away on "New issue".
  if (!accountId && startNew === undefined) {
    return <ActiveRentals session={session} q={q} />;
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

/** Every site with equipment on hire, with what it is accruing, searchable. */
async function ActiveRentals({
  session,
  q,
}: {
  session: StaffSession;
  q?: string;
}) {
  // Only sites actually holding equipment: this screen answers "who has our
  // stock and might want more", and a fully-returned site is noise here — it
  // lives under Accounts → All.
  const accounts = (await listAccounts(session, { status: 'open', q }, today())).filter(
    (account) => account.qtyOut > 0,
  );

  return (
    <Screen>
      <PageHeader
        title="Lending"
        subtitle="Tap a site to lend more to it"
      />

      {/* Both doors, in the open. Lending to a site that already exists is
          the common case and is the list below; the other two were previously
          reachable only from inside the delivery flow, which is where people
          went looking for them and did not find them. */}
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Link
          href="/issue?new=1"
          className="tap flex items-center justify-center gap-1.5 rounded-xl bg-steel px-3 font-semibold text-white hover:bg-steel-strong"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          New lending
        </Link>
        <Link
          href="/customers/new"
          className="tap flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-card px-3 font-semibold hover:bg-paper"
        >
          New customer
        </Link>
      </div>

      <form action="/issue" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Customer or site"
          aria-label="Search rentals"
          className="tap w-full rounded-xl border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button type="submit" className="tap rounded-xl bg-steel px-4 font-semibold text-white hover:bg-steel-strong">
          Search
        </button>
      </form>

      <SectionTitle tone="amber">Lending out now</SectionTitle>

      {accounts.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : 'No sites are open'}
          action={
            <Link
              href="/issue?new=1"
              className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white"
            >
              New lending
            </Link>
          }
        >
          {q
            ? 'Try the contractor’s name, or part of the site name.'
            : 'Open a site from a customer’s page, or start a delivery and create it as you go.'}
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account, index) => (
            <li key={account.id}>
              <RowLink href={`/issue?account=${account.id}`} index={index + 1}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{account.customerName}</span>
                  {account.qtyOut > 0 ? (
                    <Chip tone="amber">
                      <Qty qty={account.qtyOut} /> out
                    </Chip>
                  ) : (
                    <Chip tone="green">all back</Chip>
                  )}
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>
                    {account.siteName} · {formatDays(account.daysOpen)}
                  </span>
                  <span>
                    {account.perDay > 0 ? (
                      <>
                        <Money paise={account.perDay} paiseDigits />
                        /day
                      </>
                    ) : (
                      'not accruing'
                    )}
                  </span>
                </div>
              </RowLink>
            </li>
          ))}
        </List>
      )}
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
