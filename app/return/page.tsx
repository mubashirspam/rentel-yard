/**
 * §08.3 fast return — account → outstanding list → qty in.
 *
 * Without an account in the URL this is a picker showing only sites that have
 * something out, because a return against an empty site is always a mistake.
 */

import Link from 'next/link';

import { ReturnSheet } from '@/components/domain/return-sheet';
import { Chip, EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { billedRentByAccount } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { formatDays } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; item?: string; view?: string; q?: string }>;
}) {
  const session = await requirePageSession('/return');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId, item: itemId, view, q } = await searchParams;

  if (!accountId) return <AccountChooser session={session} asOf={asOf} view={view} q={q} />;

  const detail = await orNotFound(getAccountDetail(session, accountId, asOf));

  return (
    <Screen>
      <PageHeader
        back={{ href: `/accounts/${accountId}`, label: detail.account.siteName }}
        title="Record return"
        subtitle={`${detail.customer.name} · ${detail.account.siteName}`}
      />

      {detail.outstanding.length === 0 ? (
        <EmptyState
          title="Nothing is out on this site"
          action={
            <Link
              href={`/accounts/${accountId}`}
              className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
            >
              Back to the account
            </Link>
          }
        >
          Everything issued here has already come back.
        </EmptyState>
      ) : (
        <ReturnSheet
          accountId={accountId}
          siteName={detail.account.siteName}
          customerName={detail.customer.name}
          outstanding={detail.outstanding}
          today={asOf}
          focusItemId={itemId}
        />
      )}
    </Screen>
  );
}

async function AccountChooser({
  session,
  asOf,
  view,
  q,
}: {
  session: StaffSession;
  asOf: string;
  view?: string;
  q?: string;
}) {
  const showReturned = view === 'returned';

  const all = await listAccounts(session, { status: 'open', q }, asOf);
  const accounts = all.filter((account) =>
    showReturned ? account.qtyOut === 0 : account.qtyOut > 0,
  );
  const billed = await billedRentByAccount(
    session,
    accounts.map((account) => account.id),
  );

  const tabHref = (target: string) =>
    q ? `/return?view=${target}&q=${encodeURIComponent(q)}` : `/return?view=${target}`;

  return (
    <Screen>
      <PageHeader title="Return" subtitle="Which site is the equipment coming back from?" />

      <form action="/return" className="mb-3 flex gap-2">
        {showReturned && <input type="hidden" name="view" value="returned" />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Customer or site"
          aria-label="Search sites"
          className="tap w-full rounded-xl border border-rule bg-card px-3 text-base shadow-sm outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button
          type="submit"
          className="tap rounded-xl bg-steel px-4 font-semibold text-white shadow-sm hover:bg-steel-strong"
        >
          Search
        </button>
      </form>

      <div className="mb-3 flex gap-3 text-sm">
        <Link href={tabHref('outstanding')} className={showReturned ? 'text-steel' : 'font-semibold'}>
          Not returned
        </Link>
        <Link href={tabHref('returned')} className={showReturned ? 'font-semibold' : 'text-steel'}>
          Returned
        </Link>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title={
            q
              ? `Nothing matches “${q}”`
              : showReturned
                ? 'No site is fully returned'
                : 'Nothing is out anywhere'
          }
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white shadow-sm"
            >
              Issue equipment
            </Link>
          }
        >
          {showReturned
            ? 'Sites where every item has come back appear here.'
            : 'Every item the yard owns is on the racks.'}
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => {
            const unbilled = account.accruedRent - (billed.get(account.id) ?? 0);
            return (
              <li key={account.id}>
                <RowLink href={`/return?account=${account.id}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{account.customerName}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {account.qtyOut > 0 ? (
                        <Chip tone="amber">
                          <Qty qty={account.qtyOut} /> out
                        </Chip>
                      ) : (
                        <Chip tone="green">returned</Chip>
                      )}
                      <Chip tone={unbilled > 0 ? 'red' : 'green'}>
                        {unbilled > 0 ? 'not billed' : 'billed'}
                      </Chip>
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                    <span>{account.siteName}</span>
                    <span>
                      <Money paise={account.balance} /> · {formatDays(account.daysOpen)}
                    </span>
                  </div>
                </RowLink>
              </li>
            );
          })}
        </List>
      )}
    </Screen>
  );
}
