/**
 * The open khatas, biggest debt first — the list an admin works down when
 * chasing returns and money.
 */

import Link from 'next/link';

import { Chip, EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
import { Segmented } from '@/components/ui/segmented';
import { Money, Qty } from '@/components/ui/money';
import { listAccounts } from '@/lib/accounts/service';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { formatDays } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { q?: string; status?: string };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requirePageSession('/accounts');
  requireCapability(session, 'account.manage');

  const { q, status } = await searchParams;
  const showClosed = status === 'all';

  const accounts = await listAccounts(
    session,
    { q, status: showClosed ? 'all' : 'open' },
    today(),
  );

  return (
    <Screen>
      <PageHeader
        title="Accounts"
        subtitle={showClosed ? 'Every site, open and closed' : 'Open sites'}
      />

      {/* A plain GET form: it needs no JavaScript, so it still works while the
          service worker is serving a stale shell (M5). */}
      <form action="/accounts" className="mb-4 flex gap-2">
        {showClosed && <input type="hidden" name="status" value="all" />}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Customer or site"
          aria-label="Search accounts"
          className="tap w-full rounded border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button type="submit" className="tap rounded bg-steel px-4 font-medium text-white">
          Search
        </button>
      </form>

      <Segmented
        className="mb-4"
        options={[
          {
            href: q ? `/accounts?q=${encodeURIComponent(q)}` : '/accounts',
            label: 'Open',
            active: !showClosed,
          },
          {
            href: q ? `/accounts?status=all&q=${encodeURIComponent(q)}` : '/accounts?status=all',
            label: 'All sites',
            active: showClosed,
          },
        ]}
      />

      {accounts.length === 0 ? (
        <EmptyState
          title={q ? `Nothing matches “${q}”` : 'No open sites'}
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Record a delivery
            </Link>
          }
        >
          {q
            ? 'Try the contractor’s name, or part of the site name.'
            : 'An account opens the first time equipment goes out to a site.'}
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => (
            <li key={account.id}>
              <RowLink href={`/accounts/${account.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{account.customerName}</span>
                  <Money paise={account.balance} className="font-medium" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>
                    {account.siteName}
                    {account.status === 'closed' ? (
                      <>
                        {' '}
                        <Chip>Closed</Chip>
                      </>
                    ) : (
                      account.isCompleted && (
                        <>
                          {' '}
                          <Chip tone="green">✓ Completed</Chip>
                        </>
                      )
                    )}
                  </span>
                  <span>
                    {account.qtyOut > 0 ? (
                      <>
                        <Qty qty={account.qtyOut} /> out · <Money paise={account.perDay} paiseDigits />
                        /day
                      </>
                    ) : (
                      <>nothing out · {formatDays(account.daysOpen)}</>
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
