/**
 * §08.3 fast issue. Arriving with `?account=` skips straight to the items.
 */

import Link from 'next/link';

import { IssueForm, type IssueTarget } from '@/components/domain/issue-form';
import { Chip, EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
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

  const [stock, target] = await Promise.all([
    listStock(session),
    accountId ? findTarget(session, accountId, asOf) : Promise.resolve(undefined),
  ]);

  return (
    <Screen>
      <PageHeader
        title="New issue"
        subtitle="Equipment leaving the yard. Rent starts on the date you record."
        back={
          target
            ? { href: `/accounts/${target.accountId}`, label: target.siteName }
            : { href: '/issue', label: 'Issue' }
        }
      />
      <IssueForm items={stock} today={asOf} initialTarget={target} />
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
  const accounts = await listAccounts(session, { status: 'open', q }, today());

  return (
    <Screen>
      <PageHeader
        title="Issue"
        subtitle="Sites with equipment on hire — tap one to issue more"
        action={
          <Link
            href="/issue?new=1"
            className="tap inline-flex items-center gap-1 rounded-xl bg-steel px-4 font-semibold text-white shadow-sm hover:bg-steel-strong"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4" aria-hidden>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            New issue
          </Link>
        }
      />

      <form action="/issue" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Customer or site"
          aria-label="Search rentals"
          className="tap w-full rounded-xl border border-rule bg-card px-3 text-base shadow-sm outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button type="submit" className="tap rounded-xl bg-steel px-4 font-semibold text-white shadow-sm hover:bg-steel-strong">
          Search
        </button>
      </form>

      {accounts.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : 'No sites are open'}
          action={
            <Link
              href="/issue?new=1"
              className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white shadow-sm"
            >
              New issue
            </Link>
          }
        >
          {q
            ? 'Try the contractor’s name, or part of the site name.'
            : 'Start the first issue and the site opens itself here.'}
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => (
            <li key={account.id}>
              <RowLink href={`/issue?account=${account.id}`}>
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
  };
}
