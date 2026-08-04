'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Card, Chip, EmptyState } from '../ui/layout';
import { Money } from '../ui/money';
import { Segmented } from '../ui/segmented';
import { CustomerBand, SiteRow } from './site-facts';

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
  customerMobile: string;
  siteName: string;
  balance: number;
  qtyOut: number;
  perDay: number;
  /** The oldest lot still out, not the day the khata was opened. */
  outSince: string | null;
  daysOut: number;
  accruedRent: number;
  /** Paise of rent and damages already frozen into invoices. */
  billed: number;
  status: 'open' | 'closed';
}

interface Group {
  customerId: string;
  customerName: string;
  customerMobile: string;
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
        customerMobile: row.customerMobile,
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
                <CustomerBand
                  href={`/accounts/${group.sites[0].id}?site=all`}
                  customerName={group.customerName}
                  mobile={group.customerMobile}
                  siteCount={group.sites.length}
                  balance={group.balance}
                  aside={
                    group.unbilled > 0 ? (
                      <Chip tone="amber">
                        <Money paise={group.unbilled} /> to bill
                      </Chip>
                    ) : null
                  }
                />

                <ul className="divide-y divide-rule">
                  {group.sites.map((site, index) => {
                    const unbilled = unbilledOn(site);

                    return (
                      <li key={site.id}>
                        <Link href={`/accounts/${site.id}`} className="tap block px-4 py-2.5 hover:bg-paper">
                          <SiteRow
                            index={index + 1}
                            siteName={site.siteName}
                            since={site.outSince}
                            days={site.daysOut}
                            perDay={site.perDay}
                            total={site.accruedRent}
                            trailing={
                              <>
                                {unbilled > 0 && (
                                  <Chip tone="red">
                                    <Money paise={unbilled} /> to bill
                                  </Chip>
                                )}
                                {site.status === 'closed' && <Chip>closed</Chip>}
                              </>
                            }
                          />
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
