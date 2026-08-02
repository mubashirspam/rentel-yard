'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatDays } from '@/lib/format';

import { Card, Chip, EmptyState } from '../ui/layout';
import { Money, Qty } from '../ui/money';
import { Segmented } from '../ui/segmented';

/**
 * Every khata, gathered under the contractor who holds it.
 *
 * The split is **billed / not billed**, not open / closed. Open and closed is a
 * fact about the account record; billed is the question an owner is actually
 * asking — *what work is finished and still not invoiced?* A site whose
 * equipment came back last week and has never been billed is the one thing on
 * this screen that needs doing, and "open" said nothing about it.
 *
 * "Not billed" therefore means rent has accrued that no invoice covers. Most of
 * it is equipment already returned; some is still running. Both need a bill,
 * which is why they sit together.
 */

export interface AccountGroupRow {
  id: string;
  customerId: string;
  customerName: string;
  siteName: string;
  balance: number;
  qtyOut: number;
  perDay: number;
  daysOpen: number;
  accruedRent: number;
  /** Paise of rent and damages already frozen into invoices. */
  billed: number;
  status: 'open' | 'closed';
}

interface Group {
  customerId: string;
  customerName: string;
  sites: AccountGroupRow[];
  balance: number;
  qtyOut: number;
  unbilled: number;
}

/** Accrued but on no invoice. Never negative — a yard can bill ahead. */
const unbilledOn = (row: AccountGroupRow) => Math.max(0, row.accruedRent - row.billed);

export function AccountGroups({ rows }: { rows: AccountGroupRow[] }) {
  const [view, setView] = useState<'unbilled' | 'billed'>('unbilled');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      unbilled: rows.filter((row) => unbilledOn(row) > 0).length,
      billed: rows.filter((row) => unbilledOn(row) === 0).length,
    }),
    [rows],
  );

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();

    const matching = rows.filter((row) => {
      const isUnbilled = unbilledOn(row) > 0;
      if (view === 'unbilled' ? !isUnbilled : isUnbilled) return false;
      if (!term) return true;
      return (
        row.customerName.toLowerCase().includes(term) || row.siteName.toLowerCase().includes(term)
      );
    });

    const byCustomer = new Map<string, Group>();

    for (const row of matching) {
      const group = byCustomer.get(row.customerId) ?? {
        customerId: row.customerId,
        customerName: row.customerName,
        sites: [],
        balance: 0,
        qtyOut: 0,
        unbilled: 0,
      };

      group.sites.push(row);
      group.balance += row.balance;
      group.qtyOut += row.qtyOut;
      group.unbilled += unbilledOn(row);
      byCustomer.set(row.customerId, group);
    }

    return [...byCustomer.values()].sort((a, b) => b.unbilled - a.unbilled || b.balance - a.balance);
  }, [rows, view, query]);

  return (
    <div>
      <Segmented
        className="mb-3"
        options={[
          {
            href: '#unbilled',
            label: 'Not billed',
            active: view === 'unbilled',
            count: counts.unbilled,
          },
          { href: '#billed', label: 'Billed', active: view === 'billed', count: counts.billed },
        ]}
        onSelect={(index) => setView(index === 0 ? 'unbilled' : 'billed')}
      />

      <div className="relative mb-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Customer or site"
          aria-label="Search accounts"
          className="tap w-full rounded-xl border border-rule bg-card pl-9 pr-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title={
            query.trim()
              ? `Nothing matches “${query}”`
              : view === 'unbilled'
                ? 'Everything is billed'
                : 'Nothing billed yet'
          }
        >
          {view === 'unbilled'
            ? 'Every rupee that has accrued is on an invoice.'
            : 'Sites appear here once an invoice covers what they have accrued.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {groups.map((group) => (
            <li key={group.customerId}>
              <Card className="overflow-hidden">
                {/* The contractor's band: what they hold and owe across every
                    site, because that is how a yard asks about them. */}
                <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-steel-soft px-4 py-2">
                  <Link
                    href={`/customers/${group.customerId}`}
                    className="truncate font-semibold text-steel hover:underline"
                  >
                    {group.customerName}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {group.unbilled > 0 && (
                      <Chip tone="amber">
                        <Money paise={group.unbilled} /> to bill
                      </Chip>
                    )}
                    <Money
                      paise={group.balance}
                      className={`font-semibold ${group.balance > 0 ? 'text-red' : 'text-green'}`}
                    />
                  </span>
                </div>

                <ul className="divide-y divide-rule">
                  {group.sites.map((site, index) => {
                    const unbilled = unbilledOn(site);

                    return (
                      <li key={site.id}>
                        <Link href={`/accounts/${site.id}`} className="tap block px-4 py-3 hover:bg-paper">
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex min-w-0 items-baseline gap-2">
                              <span className="tabular shrink-0 text-xs font-semibold text-ink-3">
                                {index + 1}
                              </span>
                              <span className="truncate font-medium">{site.siteName}</span>
                            </span>
                            <Money paise={site.balance} className="shrink-0 text-sm font-semibold" />
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {site.qtyOut > 0 ? (
                              <Chip tone="amber">
                                <Qty qty={site.qtyOut} /> out
                              </Chip>
                            ) : (
                              <Chip tone="green">✓ all back</Chip>
                            )}
                            {unbilled > 0 && (
                              <Chip tone="red">
                                <Money paise={unbilled} /> to bill
                              </Chip>
                            )}
                            {site.perDay > 0 && (
                              <Chip tone="steel">
                                <Money paise={site.perDay} paiseDigits />
                                /day
                              </Chip>
                            )}
                            <Chip>{formatDays(site.daysOpen)}</Chip>
                            {site.status === 'closed' && <Chip>closed</Chip>}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
