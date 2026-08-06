/**
 * One khata, in full — the site screen.
 *
 * This used to be two screens wearing one URL: a contractor's totals across
 * every site (`?site=all`) *and* one site's money, with a filter strip
 * switching between them. The contractor half has moved to
 * `/customers/[id]`, which is where a person belongs, and `?site=all` now
 * redirects there so saved links still land somewhere true (D60).
 *
 * What is left is genuinely per-khata, because a bill is drawn against one
 * site and so are its ledger, its adjustments and its closing: the balance,
 * the month, what is still out, the invoices, every entry ever posted, and the
 * actions. It is a drill-down, not a destination — reached by tapping a site
 * band on the customer hub — so it is not in the tab bar and its back link
 * goes up to the person who holds it (D62).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AccountActions } from '@/components/domain/account-actions';
import { AddCharge } from '@/components/domain/add-charge';
import { BalanceCard } from '@/components/domain/balance-card';
import { BillsPanel } from '@/components/domain/bills-panel';
import { LedgerList } from '@/components/domain/ledger-list';
import { OutBySite } from '@/components/domain/out-by-site';
import { Card, Chip, EmptyState, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { differenceInCalendarDays } from '@/lib/accrual';
import { getAccountDetail } from '@/lib/accounts/service';
import { can, requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { listBillsForAccount } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { formatDayFull, formatDays, formatMonth } from '@/lib/format';
import { getMoneySummary } from '@/lib/payments/service';
import { WORDS } from '@/lib/vocabulary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ site?: string }>;
}) {
  const { id } = await params;
  const { site: siteParam } = await searchParams;
  const session = await requirePageSession(`/accounts/${id}`);
  requireCapability(session, 'account.manage');

  const asOf = today();
  const detail = await orNotFound(getAccountDetail(session, id, asOf));
  const { account, customer, balance, accrual } = detail;

  // The old customer-wide view. Its screen is the contractor's now.
  if (siteParam === 'all') redirect(`/customers/${customer.id}`);

  const showMoney = can(session, 'money.view');
  const [bills, money] = await Promise.all([
    showMoney ? listBillsForAccount(session, id, asOf) : Promise.resolve([]),
    showMoney ? getMoneySummary(session, id, asOf) : Promise.resolve(null),
  ]);

  const daysOpen = differenceInCalendarDays(account.closedOn ?? asOf, account.openedOn) + 1;
  const qtyOut = detail.outstanding.reduce((sum, line) => sum + line.qtyOut, 0);
  const perDay = detail.outstanding.reduce((sum, line) => sum + line.accruingPerDay, 0);

  const billedThisMonth = bills
    .filter((bill) => bill.issuedAt.slice(0, 7) === asOf.slice(0, 7))
    .reduce((sum, bill) => sum + bill.grandTotal, 0);

  return (
    <Screen>
      <PageHeader
        back={{ href: `/customers/${customer.id}`, label: customer.name }}
        title={account.siteName}
        subtitle={
          <>
            {customer.name} · opened {formatDayFull(account.openedOn)} · {formatDays(daysOpen)}
          </>
        }
        action={
          account.status === 'closed' ? (
            <Chip>Closed</Chip>
          ) : qtyOut === 0 ? (
            <Chip tone="green">Completed</Chip>
          ) : undefined
        }
      />

      {showMoney && (
        <BalanceCard balance={balance} asOf={asOf} minimumDays={detail.config.minimum_days} />
      )}

      {showMoney && (
        <Card className="mt-3 p-4">
          <p className="text-sm font-semibold text-ink-2">
            This month · {formatMonth(detail.thisMonth.from)}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-2">Rent accrued</dt>
            <dd className="text-right">
              <Money paise={detail.thisMonth.rentAccrued} />
            </dd>
            <dt className="text-ink-2">Damages</dt>
            <dd className="text-right">
              <Money paise={detail.thisMonth.damages} />
            </dd>
            <dt className="text-ink-2">Billed</dt>
            <dd className="text-right">
              <Money paise={billedThisMonth} />
            </dd>
            <dt className="text-ink-2">Received</dt>
            <dd className="text-right font-medium text-green">
              <Money paise={detail.thisMonth.received} />
            </dd>
          </dl>
        </Card>
      )}

      <SectionTitle
        tone="amber"
        aside={
          detail.outstanding.length > 0 ? (
            <span className="text-sm text-ink-2">tap a row to return it</span>
          ) : undefined
        }
      >
        Currently out
      </SectionTitle>

      {detail.outstanding.length > 0 ? (
        <OutBySite
          sites={[
            {
              accountId: account.id,
              siteName: account.siteName,
              status: account.status,
              balance: balance.balance,
              qtyOut,
              perDay,
              accruedRent: accrual.rentTotal + accrual.damageTotal,
              outSince: detail.outstanding.reduce<string | null>(
                (earliest, line) =>
                  earliest === null || line.since < earliest ? line.since : earliest,
                null,
              ),
              daysOut: detail.outstanding.reduce(
                (longest, line) => Math.max(longest, line.daysHeld),
                0,
              ),
              outstanding: detail.outstanding,
            },
          ]}
          minimumDays={detail.config.minimum_days}
        />
      ) : (
        <EmptyState title="Nothing is out on this site">
          {account.status === 'open'
            ? 'Everything lent from here has come back.'
            : 'The site was closed once everything was returned.'}
          {account.status === 'open' && (
            <>
              {' '}
              <Link href={`/issue?account=${account.id}`} className="font-medium text-steel">
                {WORDS.lendMore}
              </Link>
            </>
          )}
        </EmptyState>
      )}

      {showMoney && money && (
        <>
          <SectionTitle
            tone="green"
            aside={
              can(session, 'bill.issue') ? (
                <Link
                  href={`/accounts/${account.id}/bill`}
                  className="text-sm font-medium text-steel"
                >
                  Generate
                </Link>
              ) : undefined
            }
          >
            Money
          </SectionTitle>

          <BillsPanel
            bills={bills}
            money={money}
            accountId={account.id}
            canBill={can(session, 'bill.issue')}
          />
        </>
      )}

      <SectionTitle aside={<span className="text-sm text-ink-2">newest first</span>}>
        Ledger
      </SectionTitle>

      {detail.ledger.length > 0 ? (
        <LedgerList
          entries={detail.ledger}
          canReverse={can(session, 'movement.reverse') && account.status === 'open'}
          today={asOf}
        />
      ) : (
        <EmptyState title="No entries yet">
          Every lending, return, payment, and correction on this site will appear here, newest
          first.
        </EmptyState>
      )}

      <SectionTitle tone="steel">Actions</SectionTitle>
      <AccountActions
        accountId={account.id}
        status={account.status}
        canClose={detail.canClose && account.status === 'open'}
        canBill={can(session, 'bill.issue')}
        canPay={can(session, 'payment.create')}
        today={asOf}
      />

      {can(session, 'adjustment.create') && account.status === 'open' && (
        <div className="mt-3">
          <AddCharge accountId={account.id} today={asOf} />
        </div>
      )}

      {accrual.damageLines.length > 0 && (
        <p className="mt-4 text-xs text-ink-2">
          Damaged and lost items are charged at the replacement rate frozen onto the issue.
        </p>
      )}
    </Screen>
  );
}
