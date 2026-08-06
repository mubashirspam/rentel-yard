/**
 * §08.1 dashboard — "out today, due today, overdue, low stock".
 *
 * Rewritten flat. This screen had grown seven stacked sections — active sites,
 * today, overdue bills, over-limit customers, long-held lots, stock alerts, a
 * footnote — and each warning got a heading and a full list of its own, so four
 * lists of one row each pushed the day's actual work below three scrolls. It
 * also listed *sites* under contractors' names, which meant the same person
 * appeared here, on `/accounts`, and on their own screen, in three shapes.
 *
 * Four things now, in the order the owner reads them:
 *
 *   1. The four money figures they opened the app for.
 *   2. Anything wrong, one tappable line each, capped.
 *   3. The people — one card apiece, tapping through to their whole story.
 *   4. What moved today.
 *
 * A warning's job is to say *there is a thing*; the screen that fixes it holds
 * the detail. So low stock links to Stock, an over-limit contractor to their
 * own screen, and a long-held lot to the khata holding it.
 */

import Link from 'next/link';

import { CustomerCard } from '@/components/domain/customer-card';
import {
  Alert,
  Card,
  Chip,
  EmptyState,
  List,
  PageHeader,
  RowLink,
  Screen,
  SectionTitle,
  StatCard,
} from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { listCustomerCards } from '@/lib/customers/cards';
import { getDashboard, LONG_HELD_DAYS } from '@/lib/dashboard/service';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';
import { formatPaise } from '@/lib/money';
import { WORDS } from '@/lib/vocabulary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Today is a summary, not an archive — the rest is on each site's ledger. */
const TODAY_SHOWN = 3;
/** More than this and the strip becomes the wall it replaced. */
const ALERTS_SHOWN = 3;

export default async function HomePage() {
  const session = await requirePageSession('/');
  const asOf = today();

  const [data, customers] = await Promise.all([
    getDashboard(session, asOf),
    listCustomerCards(session, asOf),
  ]);

  const working = customers.filter((customer) => customer.sitesOut > 0 || customer.unbilled > 0);

  /*
   * Every warning the yard has, ranked by how much it costs to ignore: stock
   * oversold, then a contractor past their limit, then stock running out, then
   * kit that has stood on a site for months. Only the first few are shown.
   */
  const alerts = [
    ...data.negativeStock.map((row) => ({
      key: `neg-${row.id}`,
      tone: 'red' as const,
      title: `${row.name}: more out than owned`,
      detail: `${row.qtyAvailable} available — two devices may have oversold it offline`,
      href: '/stock',
    })),
    ...data.overLimit.map((customer) => ({
      key: `limit-${customer.customerId}`,
      tone: 'red' as const,
      title: `${customer.customerName} is over their credit limit`,
      detail: `${formatPaise(customer.balance)} against a limit of ${formatPaise(customer.creditLimit)}`,
      href: `/customers/${customer.customerId}`,
    })),
    ...data.lowStock.map((row) => ({
      key: `low-${row.id}`,
      tone: 'amber' as const,
      title: `${row.name} is running low`,
      detail: `${row.qtyAvailable} of ${row.qtyOwned} available right now`,
      href: '/stock',
    })),
    ...data.longHeld.slice(0, 2).map((lot, index) => ({
      key: `held-${lot.accountId}-${index}`,
      tone: 'amber' as const,
      title: `${lot.qty} × ${lot.itemName} out ${formatDays(lot.daysHeld)}`,
      detail: `${lot.customerName} · ${lot.siteName} · since ${formatDay(lot.since)}`,
      href: `/accounts/${lot.accountId}`,
    })),
  ];

  return (
    <Screen fab>
      <PageHeader title="Bismi Rental" subtitle={`${session.name} · ${formatDayFull(asOf)}`} />

      <Card className="border-steel/20 bg-gradient-to-br from-steel to-steel-strong p-4 text-white">
        <p className="text-sm font-medium text-white/80">Out on hire</p>
        <span className="tabular text-3xl font-bold tracking-tight">
          {formatPaise(data.totals.outstanding)}
        </span>
        <p className="mt-1 text-sm text-white/80">
          <Qty qty={data.totals.qtyOut} /> across {data.totals.openAccounts}{' '}
          {data.totals.openAccounts === 1 ? 'open site' : 'open sites'}
        </p>
      </Card>

      {/* The four numbers an owner opens the app for: what has been invoiced,
          what is still only accruing, what has come in, and what has not. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard
          label="Billed"
          value={formatPaise(data.totals.billed)}
          muted={data.totals.billed === 0}
        />
        <StatCard
          label="To bill"
          tone="amber"
          value={formatPaise(data.totals.notBilled)}
          muted={data.totals.notBilled === 0}
        />
        <StatCard
          label="Received"
          tone="green"
          value={formatPaise(data.totals.received)}
          muted={data.totals.received === 0}
        />
        <StatCard
          label="Not received"
          tone="red"
          value={formatPaise(data.totals.notReceived)}
          muted={data.totals.notReceived === 0}
        />
      </div>

      {alerts.length > 0 && (
        <div className="mt-3 space-y-2">
          {alerts.slice(0, ALERTS_SHOWN).map((alert) => (
            <Alert
              key={alert.key}
              tone={alert.tone}
              title={alert.title}
              detail={alert.detail}
              href={alert.href}
            />
          ))}
          {alerts.length > ALERTS_SHOWN && (
            <p className="text-xs text-ink-3">
              and {alerts.length - ALERTS_SHOWN} more —{' '}
              <Link href="/stock" className="font-medium text-steel">
                check stock
              </Link>{' '}
              and the contractors below.
            </p>
          )}
        </div>
      )}

      {/* §09 reminder queue. Nothing is sent automatically — the admin taps
          through it, one WhatsApp at a time, to contractors they know. */}
      {data.overdue.length > 0 && (
        <>
          <SectionTitle tone="red" aside={<span className="text-sm text-ink-2">tap to remind</span>}>
            Overdue bills
          </SectionTitle>
          <List>
            {data.overdue.map((bill) => (
              <li key={bill.id}>
                <RowLink href={`/bills/${bill.id}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {bill.customerName} <Chip tone="red">overdue</Chip>
                    </span>
                    <Money paise={bill.outstanding} className="font-medium text-red" />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {bill.invoiceNo} · {bill.siteName}
                    {bill.dueOn && ` · due ${formatDayFull(bill.dueOn)}`}
                  </p>
                </RowLink>
              </li>
            ))}
          </List>
        </>
      )}

      <SectionTitle
        tone="amber"
        aside={
          <Link href="/customers" className="text-sm font-medium text-steel">
            All customers
          </Link>
        }
      >
        Needs you today
      </SectionTitle>

      {working.length === 0 ? (
        <EmptyState
          title="Nothing is out and nothing is waiting to be billed"
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
            >
              Record a {WORDS.lending.toLowerCase()}
            </Link>
          }
        >
          A contractor appears here the moment equipment goes out to them, or the moment finished
          hire needs an invoice.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {working.map((customer) => (
            <li key={customer.customerId}>
              <CustomerCard facts={customer} />
            </li>
          ))}
        </ul>
      )}

      <SectionTitle
        tone="steel"
        aside={
          data.today.length > TODAY_SHOWN ? (
            <span className="text-sm text-ink-2">{data.today.length} sites moved</span>
          ) : undefined
        }
      >
        Today
      </SectionTitle>

      {data.today.length === 0 ? (
        <EmptyState title="Nothing has moved today">
          Lending and returns recorded today appear here, grouped by site.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {data.today.slice(0, TODAY_SHOWN).map((site) => (
            <li key={site.accountId}>
              <Card className="overflow-hidden">
                <Link href={`/accounts/${site.accountId}`} className="tap block hover:bg-paper">
                  <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-paper px-4 py-2">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{site.customerName}</span>
                      <span className="text-ink-2"> · {site.siteName}</span>
                    </span>
                    {site.gatePasses.length > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-ink-3">
                        {site.gatePasses.join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="px-4 py-2.5">
                    {site.out.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-steel">
                          Lent
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {site.out.map((line, index) => (
                            <li key={`out-${index}`} className="flex justify-between gap-3 text-sm">
                              <span>{line.itemName}</span>
                              <Qty qty={line.qty} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {site.back.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-green">
                          Returned
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {site.back.map((line, index) => (
                            <li key={`back-${index}`} className="flex justify-between gap-3 text-sm">
                              <span>
                                {line.itemName}
                                {line.condition !== 'good' && (
                                  <>
                                    {' '}
                                    <Chip tone={line.condition === 'lost' ? 'red' : 'amber'}>
                                      {line.condition}
                                    </Chip>
                                  </>
                                )}
                              </span>
                              <Qty qty={line.qty} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-ink-3">
        Kit standing over {LONG_HELD_DAYS} days shows in the alerts above. Reminders are never sent
        automatically — every message goes from the yard&apos;s own WhatsApp, after someone has read
        it.
      </p>
    </Screen>
  );
}
