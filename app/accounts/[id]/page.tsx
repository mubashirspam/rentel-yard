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
import { BalanceCard } from '@/components/domain/balance-card';
import { LedgerList } from '@/components/domain/ledger-list';
import { OutstandingList } from '@/components/domain/outstanding-list';
import { WhatsAppComposer } from '@/components/domain/whatsapp-composer';
import { Card, Chip, EmptyState, List, PageHeader, RowLink, Screen, SectionTitle } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { differenceInCalendarDays } from '@/lib/accrual';
import { getAccountDetail } from '@/lib/accounts/service';
import { can, requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { listBillsForAccount } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { formatDay, formatDayFull, formatDays, formatMobile, formatMonth, telHref, waHref } from '@/lib/format';
import { statementMessage, type MessageTemplate } from '@/lib/messages';
import { orgName } from '@/lib/org';
import { getMoneySummary } from '@/lib/payments/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BILL_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'steel',
  overdue: 'red',
} as const;

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/accounts/${id}`);
  requireCapability(session, 'account.manage');

  const asOf = today();
  const detail = await orNotFound(getAccountDetail(session, id, asOf));
  const { account, customer, balance, accrual } = detail;

  const showMoney = can(session, 'money.view');
  const [bills, money, yardName] = await Promise.all([
    showMoney ? listBillsForAccount(session, id, asOf) : Promise.resolve([]),
    showMoney ? getMoneySummary(session, id, asOf) : Promise.resolve(null),
    orgName(session),
  ]);

  const daysOpen = differenceInCalendarDays(account.closedOn ?? asOf, account.openedOn) + 1;

  const statement = statementMessage({
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

  const templates: MessageTemplate[] = [{ id: 'statement', label: 'Statement', text: statement }];

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
          contractor's number while standing at the gate (§08.2). */}
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href={telHref(customer.mobile)}
          className="tap inline-flex items-center rounded border border-rule bg-card px-3 font-medium"
        >
          Call {formatMobile(customer.mobile)}
        </a>
        <a
          href={waHref(customer.mobile, statement)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded border border-rule bg-card px-3 font-medium"
        >
          WhatsApp
        </a>
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
            ? 'Everything delivered here has come back. Deliver more to start it up again.'
            : 'The site was closed once everything was returned.'}
          {account.status === 'open' && (
            <>
              {' '}
              <Link href={`/issue?account=${account.id}`} className="font-medium text-steel">
                Deliver equipment
              </Link>
            </>
          )}
        </EmptyState>
      )}

      {showMoney && (
        <>
          <SectionTitle
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
           tone="green">
            Bills
          </SectionTitle>

          {bills.length === 0 ? (
            <EmptyState title="Nothing billed yet">
              Rent accrues from the day equipment leaves. Generate a bill for any period up to
              today — what is already billed is never charged twice.
            </EmptyState>
          ) : (
            <List>
              {bills.map((bill) => (
                <li key={bill.id}>
                  <RowLink href={`/bills/${bill.id}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">
                        {bill.invoiceNo}{' '}
                        <Chip tone={BILL_TONE[bill.status]}>{bill.status}</Chip>
                      </span>
                      <Money paise={bill.grandTotal} className="font-medium" />
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                      <span>
                        {formatDay(bill.periodFrom)} → {formatDayFull(bill.periodTo)}
                      </span>
                      <span>
                        {bill.outstanding > 0 ? (
                          <>
                            <Money paise={bill.outstanding} /> pending
                          </>
                        ) : (
                          'settled'
                        )}
                      </span>
                    </div>
                  </RowLink>
                </li>
              ))}
            </List>
          )}
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

      <SectionTitle tone="steel">Send a message</SectionTitle>
      <WhatsAppComposer mobile={customer.mobile} templates={templates} title="Statement" />

      {accrual.damageLines.length > 0 && (
        <p className="mt-4 text-xs text-ink-3">
          Damaged and lost items are charged at the replacement rate frozen onto the issue.
        </p>
      )}
    </Screen>
  );
}
