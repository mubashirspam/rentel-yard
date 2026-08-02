/**
 * §08.3 fast return — account → outstanding list → qty in.
 *
 * Without an account in the URL this is a picker showing only sites that have
 * something out, because a return against an empty site is always a mistake.
 */

import Link from 'next/link';

import { ReturnSheet } from '@/components/domain/return-sheet';
import { SiteBrowser } from '@/components/domain/site-browser';
import { EmptyState, PageHeader, Screen } from '@/components/ui/layout';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';

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
        back={{ href: '/return', label: 'Returns' }}
        title="Record return"
        subtitle={`${detail.customer.name} · ${detail.account.siteName}`}
      />

      {detail.outstanding.length === 0 ? (
        <EmptyState
          title="Nothing is out on this site"
          action={
            <Link
              href={`/accounts/${accountId}`}
              className="tap inline-flex items-center rounded-xl border border-rule bg-card px-4 py-2 font-medium"
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
  session: StaffSession;
  asOf: string;
}) {
  // Every open khata, out and completed alike — the browser splits them, and
  // does it on the device so the tabs answer instantly.
  const rows = await listAccounts(session, { status: 'open' }, asOf);

  return (
    <Screen>
      <PageHeader title="Returns" />

      <SiteBrowser
        rows={rows}
        hrefPrefix="/return?account="
        tabs
        emptyTitle="Nothing is out anywhere"
        emptyBody="Every item the yard owns is on the racks."
        emptyAction={
          <Link
            href="/issue"
            className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white"
          >
            New lending
          </Link>
        }
      />
    </Screen>
  );
}
