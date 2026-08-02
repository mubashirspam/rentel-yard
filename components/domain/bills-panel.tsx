'use client';

import Link from 'next/link';
import { useState } from 'react';

import type { BillSummary } from '@/lib/bills/service';
import type { MoneySummary } from '@/lib/payments/service';
import { formatDay, formatDayFull } from '@/lib/format';

import { Card, Chip, EmptyState } from '../ui/layout';
import { Money } from '../ui/money';
import { Segmented } from '../ui/segmented';

const STATUS_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'steel',
  overdue: 'red',
} as const;

/**
 * The money on a site, split the way the owner asks about it: **billed** and
 * **not billed**.
 *
 * They are different questions with different answers. Billed is a list of
 * invoices, each with a status a contractor can be shown. Not billed is one
 * figure — rent that has accrued since the last invoice and is still running —
 * and its answer is a button, not a list.
 *
 * Both come from the same replay, so they cannot disagree: `unbilled` is what
 * is left of the balance once the issued bills are accounted for.
 */
export function BillsPanel({
  bills,
  money,
  accountId,
  canBill,
}: {
  bills: BillSummary[];
  money: MoneySummary;
  accountId: string;
  canBill: boolean;
}) {
  const [view, setView] = useState<'billed' | 'not'>(bills.length === 0 ? 'not' : 'billed');
  const pending = bills.filter((bill) => bill.outstanding > 0).length;

  return (
    <div>
      <Segmented
        className="mb-3"
        options={[
          { href: '#billed', label: 'Billed', active: view === 'billed', count: bills.length },
          { href: '#not', label: 'Not billed', active: view === 'not' },
        ]}
        onSelect={(index) => setView(index === 0 ? 'billed' : 'not')}
      />

      {view === 'billed' ? (
        bills.length === 0 ? (
          <EmptyState title="Nothing billed yet">
            Rent accrues from the day equipment leaves. Bill any period up to today — what is
            already billed is never charged twice.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-2.5">
              {bills.map((bill) => (
                <li key={bill.id}>
                  <Link href={`/bills/${bill.id}`} className="tap block">
                    <Card className="p-3 transition-colors hover:bg-paper">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold">{bill.invoiceNo}</span>
                        <Money paise={bill.grandTotal} className="font-semibold" />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Chip tone={STATUS_TONE[bill.status]}>{bill.status}</Chip>
                        <Chip>
                          {formatDay(bill.periodFrom)} → {formatDayFull(bill.periodTo)}
                        </Chip>
                        {bill.outstanding > 0 && (
                          <Chip tone="red">
                            <Money paise={bill.outstanding} /> pending
                          </Chip>
                        )}
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>

            <p className="mt-2 text-xs text-ink-3">
              {pending === 0
                ? 'Every invoice on this site is settled.'
                : `${pending} of ${bills.length} still owed.`}
            </p>
          </>
        )
      ) : (
        <Card className="p-4">
          <p className="text-sm font-medium text-ink-2">Accrued, not yet on any invoice</p>
          <p className="tabular mt-0.5 text-2xl font-bold">
            <Money paise={money.unbilled} />
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t border-rule pt-3 text-sm">
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
          </dl>

          {canBill && money.unbilled > 0 && (
            <Link
              href={`/accounts/${accountId}/bill`}
              className="tap mt-3 inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white"
            >
              Bill it now
            </Link>
          )}

          {money.unbilled === 0 && (
            <p className="mt-3 text-xs text-ink-3">
              Everything accrued on this site has been invoiced.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
