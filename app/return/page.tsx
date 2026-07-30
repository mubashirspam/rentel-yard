/**
 * §08.3 fast return — account → outstanding list → qty in.
 *
 * Without an account in the URL this is a picker showing only sites that have
 * something out, because a return against an empty site is always a mistake.
 */

import Link from 'next/link';

import { ReturnSheet } from '@/components/domain/return-sheet';
import { EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { formatDays } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; item?: string }>;
}) {
  const session = await requirePageSession('/return');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId, item: itemId } = await searchParams;

  if (!accountId) return <AccountChooser session={session} asOf={asOf} />;

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
}: {
  session: Awaited<ReturnType<typeof requirePageSession>>;
  asOf: string;
}) {
  const accounts = (await listAccounts(session, { status: 'open' }, asOf)).filter(
    (account) => account.qtyOut > 0,
  );

  return (
    <Screen>
      <PageHeader title="Return" subtitle="Which site is the equipment coming back from?" />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nothing is out anywhere"
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Issue equipment
            </Link>
          }
        >
          Every item the yard owns is on the racks.
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => (
            <li key={account.id}>
              <RowLink href={`/return?account=${account.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{account.customerName}</span>
                  <span className="font-medium">
                    <Qty qty={account.qtyOut} /> out
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
          ))}
        </List>
      )}
    </Screen>
  );
}
