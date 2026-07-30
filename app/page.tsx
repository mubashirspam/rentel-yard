/**
 * §08.1 dashboard.
 *
 * "Out today, due today, overdue, low stock." Two of those need bills, which
 * arrive at M4 — see `lib/dashboard/service.ts` for what stands in until then.
 */

import Link from 'next/link';

import { Card, Chip, EmptyState, List, PageHeader, RowLink, Screen, SectionTitle } from '@/components/ui/layout';
import { BigMoney, Money, Qty } from '@/components/ui/money';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getDashboard, LONG_HELD_DAYS } from '@/lib/dashboard/service';
import { formatDay, formatDayFull, formatDays, MOVEMENT_LABEL } from '@/lib/format';

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
        action={
          <Link
            href="/issue"
            className="tap inline-flex items-center rounded bg-steel px-4 font-medium text-white"
          >
            Issue
          </Link>
        }
      />

      <Card className="p-4">
        <p className="text-sm font-medium text-ink-2">Out on hire</p>
        <BigMoney paise={data.totals.outstanding} tone={data.totals.outstanding > 0 ? 'due' : 'settled'} />
        <p className="mt-1 text-sm text-ink-2">
          <Qty qty={data.totals.qtyOut} /> across {data.totals.openAccounts}{' '}
          {data.totals.openAccounts === 1 ? 'open site' : 'open sites'}
        </p>
      </Card>

      <SectionTitle>Today</SectionTitle>
      {data.today.length === 0 ? (
        <EmptyState
          title="Nothing has moved today"
          action={
            <Link
              href="/issue"
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Record an issue
            </Link>
          }
        >
          Gate passes recorded today — out and back — appear here.
        </EmptyState>
      ) : (
        <List>
          {data.today.map((movement, index) => (
            <li key={`${movement.accountId}-${index}`}>
              <RowLink href={`/accounts/${movement.accountId}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {MOVEMENT_LABEL[movement.type] ?? movement.type} <Qty qty={movement.qty} /> ×{' '}
                    {movement.itemName}
                  </span>
                  {movement.gatePassNo && (
                    <span className="shrink-0 text-xs text-ink-3">{movement.gatePassNo}</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-ink-2">
                  {movement.customerName} · {movement.siteName}
                </p>
              </RowLink>
            </li>
          ))}
        </List>
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
