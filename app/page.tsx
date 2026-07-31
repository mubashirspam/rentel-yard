/**
 * §08.1 dashboard.
 *
 * "Out today, due today, overdue, low stock." Two of those need bills, which
 * arrive at M4 — see `lib/dashboard/service.ts` for what stands in until then.
 */

import Link from 'next/link';

import { Card, Chip, EmptyState, List, PageHeader, RowLink, Screen, SectionTitle } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getDashboard, LONG_HELD_DAYS } from '@/lib/dashboard/service';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';
import { formatPaise } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requirePageSession('/');
  const asOf = today();
  const data = await getDashboard(session, asOf);

  return (
    <Screen>
      <PageHeader
        title="Yard Ledger"
        subtitle={`${session.name} · ${formatDayFull(asOf)}`}
      />

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
        <Tally label="Billed" paise={data.totals.billed} />
        <Tally label="Not billed yet" paise={data.totals.notBilled} tone="text-amber" />
        <Tally label="Received" paise={data.totals.received} tone="text-green" />
        <Tally
          label="Not received"
          paise={data.totals.notReceived}
          tone={data.totals.notReceived > 0 ? 'text-red' : undefined}
        />
      </div>

      <SectionTitle
        aside={
          <Link href="/accounts" className="text-sm font-medium text-steel">
            All accounts
          </Link>
        }
      >
        Active sites
      </SectionTitle>
      {data.activeSites.length === 0 ? (
        <EmptyState title="No sites are open">
          An account appears here the first time equipment goes out to a site.
        </EmptyState>
      ) : (
        <List>
          {data.activeSites.map((site) => (
            <li key={site.accountId}>
              <RowLink href={`/accounts/${site.accountId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{site.customerName}</span>
                  <Money
                    paise={site.balance}
                    className={`font-medium ${site.balance > 0 ? 'text-red' : 'text-green'}`}
                  />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>{site.siteName}</span>
                  <span>
                    {site.qtyOut > 0 ? (
                      <>
                        <Qty qty={site.qtyOut} /> out ·{' '}
                        <Money paise={site.perDay} paiseDigits />
                        /day
                      </>
                    ) : (
                      'nothing out'
                    )}
                  </span>
                </div>
              </RowLink>
            </li>
          ))}
        </List>
      )}

      <SectionTitle>Today</SectionTitle>
      {data.today.length === 0 ? (
        <EmptyState
          title="Nothing has moved today"
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Record a delivery
            </Link>
          }
        >
          Deliveries and returns recorded today appear here, grouped by site.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {data.today.map((site) => (
            <li key={site.accountId}>
              <Card className="overflow-hidden">
                <Link
                  href={`/accounts/${site.accountId}`}
                  className="tap block px-4 py-3 hover:bg-paper"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">{site.customerName}</span>
                    {site.gatePasses.length > 0 && (
                      <span className="shrink-0 text-xs text-ink-3">
                        {site.gatePasses.join(', ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-2">{site.siteName}</p>

                  {site.out.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                        Delivered
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
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">
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
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* §09 reminder queue. Nothing is sent automatically — the admin taps
          through it, one WhatsApp at a time, to contractors they know. */}
      {data.overdue.length > 0 && (
        <>
          <SectionTitle aside={<span className="text-sm text-ink-2">tap to remind</span>}>
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

      {data.overLimit.length > 0 && (
        <>
          <SectionTitle>Over their credit limit</SectionTitle>
          <List>
            {data.overLimit.map((customer) => (
              <li key={customer.customerId}>
                <RowLink href={`/customers/${customer.customerId}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{customer.customerName}</span>
                    <Money paise={customer.balance} className="font-medium text-red" />
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    limit <Money paise={customer.creditLimit} />
                  </p>
                </RowLink>
              </li>
            ))}
          </List>
        </>
      )}

      {data.longHeld.length > 0 && (
        <>
          <SectionTitle
            aside={<span className="text-sm text-ink-2">over {LONG_HELD_DAYS} days</span>}
          >
            Out a long time
          </SectionTitle>
          <List>
            {data.longHeld.map((lot, index) => (
              <li key={`${lot.accountId}-${index}`}>
                <RowLink href={`/accounts/${lot.accountId}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      <Qty qty={lot.qty} /> × {lot.itemName}
                    </span>
                    <span className="shrink-0 text-sm text-ink-2">{formatDays(lot.daysHeld)}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-2">
                    {lot.customerName} · {lot.siteName} · since {formatDay(lot.since)}
                  </p>
                </RowLink>
              </li>
            ))}
          </List>
        </>
      )}

      {(data.negativeStock.length > 0 || data.lowStock.length > 0) && (
        <>
          <SectionTitle
            aside={
              <Link href="/stock" className="text-sm font-medium text-steel">
                Stock
              </Link>
            }
          >
            Stock alerts
          </SectionTitle>
          <Card className="divide-y divide-rule">
            {data.negativeStock.map((row) => (
              <p key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span>
                  {row.name} <Chip tone="red">More out than owned</Chip>
                </span>
                <span className="tabular font-medium text-red">{row.qtyAvailable}</span>
              </p>
            ))}
            {data.lowStock.map((row) => (
              <p key={row.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span>
                  {row.name} <Chip tone="amber">Running low</Chip>
                </span>
                <span className="tabular font-medium text-amber">{row.qtyAvailable} left</span>
              </p>
            ))}
          </Card>
        </>
      )}

      <p className="mt-6 text-xs text-ink-3">
        Reminders are never sent automatically — every message goes from the yard&apos;s own
        WhatsApp, after someone has read it.
      </p>
    </Screen>
  );
}

/** One of the four money counts. Quiet when it is zero. */
function Tally({ label, paise, tone }: { label: string; paise: number; tone?: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`tabular mt-0.5 text-lg font-bold ${paise === 0 ? 'text-ink-3' : (tone ?? '')}`}>
        {formatPaise(paise)}
      </p>
    </Card>
  );
}
