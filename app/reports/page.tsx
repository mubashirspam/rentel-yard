/**
 * Reports — year and month analysis. Pick a year for the billed-vs-received
 * table, tap a month for the detail underneath it.
 */

import Link from 'next/link';

import { Card, Chip, List, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { formatMonth } from '@/lib/format';
import { getMonthDetail, getYearOverview } from '@/lib/reports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { year?: string; month?: string };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await requirePageSession('/reports');
  requireCapability(session, 'money.view');

  const asOf = today();
  const params = await searchParams;

  const currentYear = Number(asOf.slice(0, 4));
  const year = /^\d{4}$/.test(params.year ?? '') ? Number(params.year) : currentYear;
  const month =
    params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) && params.month <= asOf.slice(0, 7)
      ? params.month
      : undefined;

  const [overview, detail] = await Promise.all([
    getYearOverview(session, year),
    month ? getMonthDetail(session, month) : Promise.resolve(undefined),
  ]);

  const years = Array.from({ length: 4 }, (_, index) => currentYear - index);

  return (
    <Screen>
      <PageHeader title="Reports" subtitle="Billed and received, year by year, month by month" />

      <form action="/reports" className="mb-4 flex gap-2">
        <select
          name="year"
          defaultValue={String(year)}
          aria-label="Year"
          className="tap w-full rounded-xl border border-rule bg-card px-3 text-base shadow-sm outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        >
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="tap rounded-xl bg-steel px-4 font-semibold text-white shadow-sm hover:bg-steel-strong"
        >
          Show
        </button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-sm font-medium text-ink-2">Billed in {year}</p>
          <Money paise={overview.billedTotal} className="mt-1 block text-xl font-bold" />
        </Card>
        <Card className="p-4">
          <p className="text-sm font-medium text-ink-2">Received in {year}</p>
          <Money paise={overview.receivedTotal} className="mt-1 block text-xl font-bold text-green" />
        </Card>
      </div>

      <SectionTitle aside={<span className="text-sm text-ink-2">tap a month for detail</span>}>
        Months of {year}
      </SectionTitle>
      <List>
        {overview.months.map((row) => {
          const isFuture = row.month > asOf.slice(0, 7);
          const selected = row.month === month;
          const quiet = row.billed === 0 && row.received === 0;

          return (
            <li key={row.month}>
              {isFuture ? (
                <div className="flex items-baseline justify-between gap-3 px-4 py-3 text-ink-3">
                  <span>{formatMonth(row.month)}</span>
                  <span className="text-sm">—</span>
                </div>
              ) : (
                <Link
                  href={`/reports?year=${year}&month=${row.month}`}
                  className={`tap block px-4 py-3 hover:bg-paper ${selected ? 'bg-steel-soft/50' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={quiet ? 'text-ink-3' : 'font-medium'}>
                      {formatMonth(row.month)}
                      {selected && <span className="text-steel"> ·</span>}
                    </span>
                    <span className="text-sm">
                      <Money paise={row.billed} className="font-medium" />
                      <span className="text-ink-3"> billed · </span>
                      <Money paise={row.received} className="font-medium text-green" />
                      <span className="text-ink-3"> received</span>
                    </span>
                  </div>
                </Link>
              )}
            </li>
          );
        })}
      </List>

      {detail && (
        <>
          <SectionTitle>{formatMonth(detail.month)}</SectionTitle>

          <Card className="p-4">
            <p className="text-sm font-semibold text-ink-2">Billing</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-2">Bills issued</dt>
              <dd className="text-right tabular">{detail.billsCount}</dd>
              <dt className="text-ink-2">Rent billed</dt>
              <dd className="text-right">
                <Money paise={detail.rentBilled} />
              </dd>
              <dt className="text-ink-2">Damages billed</dt>
              <dd className="text-right">
                <Money paise={detail.damagesBilled} />
              </dd>
              <dt className="font-medium">Billed total</dt>
              <dd className="text-right">
                <Money paise={detail.billed} className="font-medium" />
              </dd>
            </dl>
          </Card>

          <Card className="mt-3 p-4">
            <p className="text-sm font-semibold text-ink-2">Collections</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-2">Payments</dt>
              <dd className="text-right tabular">{detail.paymentsCount}</dd>
              <dt className="font-medium">Received total</dt>
              <dd className="text-right">
                <Money paise={detail.received} className="font-medium text-green" />
              </dd>
            </dl>
            {detail.receivedByMethod.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5 border-t border-rule pt-2">
                {detail.receivedByMethod.map((row) => (
                  <Chip key={row.method} tone="steel">
                    {row.method} <Money paise={row.amount} symbol={false} />
                  </Chip>
                ))}
              </p>
            )}
          </Card>

          <Card className="mt-3 p-4">
            <p className="text-sm font-semibold text-ink-2">Equipment moved</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-2">Issued</dt>
              <dd className="text-right">
                <Qty qty={detail.units.issued} />
              </dd>
              <dt className="text-ink-2">Returned good</dt>
              <dd className="text-right text-green">
                <Qty qty={detail.units.returned} />
              </dd>
              <dt className="text-ink-2">Damaged</dt>
              <dd className="text-right text-amber">
                <Qty qty={detail.units.damaged} />
              </dd>
              <dt className="text-ink-2">Lost</dt>
              <dd className="text-right text-red">
                <Qty qty={detail.units.lost} />
              </dd>
            </dl>
          </Card>

          {detail.topCustomers.length > 0 && (
            <>
              <SectionTitle>Billed to, biggest first</SectionTitle>
              <List>
                {detail.topCustomers.map((customer) => (
                  <li
                    key={customer.name}
                    className="flex items-baseline justify-between gap-3 px-4 py-3"
                  >
                    <span className="font-medium">{customer.name}</span>
                    <Money paise={customer.billed} className="font-medium" />
                  </li>
                ))}
              </List>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
