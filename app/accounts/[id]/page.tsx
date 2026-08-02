/**
 * §08.2 — "the one that matters".
 *
 * Everything an admin needs while standing in front of a contractor, on one
 * scrollable page: who and where, what is owed, what is still out, what to do
 * next, and the full ledger underneath.
 */

import Link from 'next/link';

import { AccountActions } from '@/components/domain/account-actions';
import { AddCharge } from '@/components/domain/add-charge';
import { BillsPanel } from '@/components/domain/bills-panel';
import { BalanceCard } from '@/components/domain/balance-card';
import { LedgerList } from '@/components/domain/ledger-list';
import { OutstandingList } from '@/components/domain/outstanding-list';
import { Card, Chip, EmptyState, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { differenceInCalendarDays } from '@/lib/accrual';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { can, requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { listBillsForAccount } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { formatDayFull, formatDays, formatMobile, formatMonth, telHref, waHref } from '@/lib/format';
import { statementMessage } from '@/lib/messages';
import { orgName } from '@/lib/org';
import { messageLanguage } from '@/lib/settings/service';
import { getMoneySummary } from '@/lib/payments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/accounts/${id}`);
  requireCapability(session, 'account.manage');

  const asOf = today();
  const detail = await orNotFound(getAccountDetail(session, id, asOf));
  const { account, customer, balance, accrual } = detail;

  const showMoney = can(session, 'money.view');
  const [siblings, bills, money, yardName, language] = await Promise.all([
    listAccounts(session, { customerId: customer.id, status: 'all' }, asOf),
    showMoney ? listBillsForAccount(session, id, asOf) : Promise.resolve([]),
    showMoney ? getMoneySummary(session, id, asOf) : Promise.resolve(null),
    orgName(session),
    messageLanguage(session),
  ]);

  const daysOpen = differenceInCalendarDays(account.closedOn ?? asOf, account.openedOn) + 1;

  const statement = statementMessage({
    language,
    yardName,
    customerName: customer.name,
    siteName: account.siteName,
    outstandingItems: detail.outstanding.map((line) => ({
      itemName: line.itemName,
      qtyOut: line.qtyOut,
    })),
    balance: balance.balance,
    asOf,
  });

  const billedThisMonth = bills
    .filter((bill) => bill.issuedAt.slice(0, 7) === asOf.slice(0, 7))
    .reduce((sum, bill) => sum + bill.grandTotal, 0);

  return (
    <Screen>
      <PageHeader
        back={{ href: '/accounts', label: 'Accounts' }}
        title={account.siteName}
        subtitle={
          <>
            Opened {formatDayFull(account.openedOn)} · {formatDays(daysOpen)}
            {account.closedOn ? ` · closed ${formatDayFull(account.closedOn)}` : ''}
          </>
        }
        action={
          /*
           * Three states, not two. A site with everything back is *completed*
           * — nothing accruing, nothing to chase in the yard — but it stays
           * open so the next load out needs no new account (§02: closing is a
           * deliberate act, and it is refused while anything is out).
           */
          account.status === 'closed' ? (
            <Chip tone="neutral">Closed</Chip>
          ) : detail.outstanding.length === 0 ? (
            <Chip tone="green">✓ Completed</Chip>
          ) : (
            <Chip tone="steel">Open</Chip>
          )
        }
      />

      {/* Tap to call, tap to WhatsApp — the two things an admin does with a
          contractor's number while standing at the gate (§08.2). The WhatsApp
          button carries the ready-made statement; there is no composer on this
          screen, because editing a message is the rare case and belongs under
          More. */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href={telHref(customer.mobile)}
          className="tap inline-flex items-center gap-1.5 rounded-xl border border-rule bg-card px-3 font-semibold"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1z" />
          </svg>
          Call {formatMobile(customer.mobile)}
        </a>
        <a
          href={waHref(customer.mobile, statement)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center gap-1.5 rounded-xl bg-green px-3 font-semibold text-white"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.23.64-1.33 1.22-1.84 1.27-.5.05-1.13.24-3.8-.8-3.2-1.26-5.24-4.53-5.4-4.74-.16-.21-1.3-1.73-1.3-3.3s.82-2.34 1.11-2.66c.29-.32.63-.4.84-.4h.6c.2 0 .46-.07.71.55l.98 2.36c.08.18.14.4.03.63l-.4.6-.56.6c-.17.18-.36.37-.16.72.2.35.9 1.5 1.94 2.42 1.33 1.19 2.45 1.56 2.8 1.73.35.18.55.15.76-.09l1.16-1.35c.27-.32.5-.25.85-.15l2.26.9c.35.17.58.26.67.4.08.15.08.85-.15 1.5z" />
          </svg>
          WhatsApp
        </a>
        <Link
          href={`/customers/${customer.id}`}
          className="tap inline-flex items-center rounded-xl border border-rule bg-card px-3 font-semibold"
        >
          Customer
        </Link>
      </div>

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

      {money && money.billedTotal > 0 && (
        <Card className="mt-3 p-4">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink-2">Billed so far</dt>
            <dd className="text-right">
              <Money paise={money.billedTotal} />
            </dd>
            <dt className="text-ink-2">Received</dt>
            <dd className="text-right">
              <Money paise={money.paidTotal} />
            </dd>
            <dt className="text-ink-2">Pending on bills</dt>
            <dd className="text-right font-medium">
              <Money paise={money.pendingOnBills} />
            </dd>
            <dt className="text-ink-2">Accrued, not yet billed</dt>
            <dd className="text-right">
              <Money paise={money.unbilled} />
            </dd>
          </dl>
        </Card>
      )}

      <SectionTitle
        aside={
          detail.outstanding.length > 0 ? (
            <span className="text-sm text-ink-2">tap a row to return it</span>
          ) : undefined
        }
       tone="amber">
        Currently out
      </SectionTitle>

      {detail.outstanding.length > 0 ? (
        <OutstandingList
          lines={detail.outstanding}
          accountId={account.id}
          minimumDays={detail.config.minimum_days}
        />
      ) : (
        <EmptyState title="Nothing is out on this site">
          {account.status === 'open'
            ? 'Everything lent from here has come back. Lend more to start it up again.'
            : 'The site was closed once everything was returned.'}
          {account.status === 'open' && (
            <>
              {' '}
              <Link href={`/issue?account=${account.id}`} className="font-medium text-steel">
                Lend equipment
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
          Every issue, return, payment, and correction on this site will appear here, newest first.
        </EmptyState>
      )}

      {siblings.length > 1 && (
        <>
          <SectionTitle tone="steel">{customer.name}&apos;s sites</SectionTitle>
          <Card className="overflow-hidden">
            <ul className="divide-y divide-rule">
              {siblings.map((site) => (
                <li key={site.id}>
                  <Link
                    href={`/accounts/${site.id}`}
                    aria-current={site.id === account.id ? 'page' : undefined}
                    className={`tap block px-4 py-2.5 hover:bg-paper ${
                      site.id === account.id ? 'bg-steel-soft' : ''
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium">
                        {site.siteName}
                        {site.id === account.id && (
                          <span className="text-ink-3"> · this one</span>
                        )}
                      </span>
                      <Money paise={site.balance} className="shrink-0 text-sm font-semibold" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {site.qtyOut > 0 ? (
                        <Chip tone="amber">
                          <Qty qty={site.qtyOut} /> out
                        </Chip>
                      ) : (
                        <Chip tone="green">✓ all back</Chip>
                      )}
                      {site.status === 'closed' && <Chip>closed</Chip>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t border-rule bg-paper px-4 py-2.5">
              <span className="text-sm font-semibold">
                Total for {customer.name}
              </span>
              <Money
                paise={siblings.reduce((sum, site) => sum + site.balance, 0)}
                className="font-semibold"
              />
            </div>
          </Card>
        </>
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
        <p className="mt-4 text-xs text-ink-3">
          Damaged and lost items are charged at the replacement rate frozen onto the issue.
        </p>
      )}
    </Screen>
  );
}
