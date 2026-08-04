'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { AccountListRow } from '@/lib/accounts/service';

import { Card, EmptyState } from '../ui/layout';
import { Segmented } from '../ui/segmented';
import { CustomerBand, SiteRow } from './site-facts';

/**
 * The list of sites, on both the lending and return screens.
 *
 * One component for two screens because the question is the same one — *which
 * site?* — and the answer needs the same facts either way: how much is out,
 * how long it has been out, what it costs a day, and what is owed. Two
 * near-identical lists would drift within a week.
 *
 * Filtering is client-side over rows sent with the page: it responds on the
 * keystroke, needs no round trip, and keeps working when the signal drops —
 * which a submit button and a server round trip would not.
 */

type Range = 'all' | '7' | '30';

interface Group {
  customerId: string;
  customerName: string;
  customerMobile: string;
  sites: AccountListRow[];
  balance: number;
  qtyOut: number;
}

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'all', label: 'All' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

export function SiteBrowser({
  rows,
  hrefPrefix,
  tabs = false,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  rows: AccountListRow[];
  /** `/issue?account=` or `/return?account=`. */
  hrefPrefix: string;
  /** Show the still-out / completed split. The lending screen has no use for it. */
  tabs?: boolean;
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [view, setView] = useState<'out' | 'done'>('out');

  const cutoff = useMemo(() => {
    if (range === 'all') return null;
    const date = new Date();
    date.setDate(date.getDate() - Number(range));
    return date.toISOString().slice(0, 10);
  }, [range]);

  const groups = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');

    const matching = rows.filter((row) => {
      /*
       * The two tabs are not opposites, and treating them as one made partial
       * returns disappear.
       *
       * A site mid-job has forty sheets back and sixty still standing. Splitting
       * on `qtyOut > 0` alone put it in "Still out" and nowhere else, so the
       * forty that came back could not be found from this screen at all. Each
       * tab now asks its own question — is anything out, has anything come
       * back — and a part-returned site truthfully answers yes to both.
       */
      if (tabs && (view === 'out' ? row.qtyOut === 0 : row.qtyReturned === 0)) return false;
      // Recency means "when did the kit go out", not "when was the khata
      // opened" — the same distinction the tiles themselves now draw.
      if (cutoff && (row.outSince ?? row.openedOn) < cutoff) return false;
      if (!term) return true;

      return (
        row.customerName.toLowerCase().includes(term) ||
        row.siteName.toLowerCase().includes(term) ||
        (digits.length >= 3 && row.customerMobile.includes(digits))
      );
    });

    /*
     * One card per contractor, their sites nested inside it.
     *
     * Ibrahim with three sites was three separate tiles, scattered down the
     * list wherever each one's balance happened to sort it — so the screen
     * never answered "what has Ibrahim got out?" without scrolling and adding
     * up. Grouping is how the yard already talks about its customers.
     */
    const byCustomer = new Map<string, Group>();

    for (const row of matching) {
      const group = byCustomer.get(row.customerId) ?? {
        customerId: row.customerId,
        customerName: row.customerName,
        customerMobile: row.customerMobile,
        sites: [],
        balance: 0,
        qtyOut: 0,
      };

      group.sites.push(row);
      group.balance += row.balance;
      group.qtyOut += row.qtyOut;
      byCustomer.set(row.customerId, group);
    }

    // Whoever is still holding equipment first, then whoever owes most. A
    // contractor with nothing out is a money question, not a yard question.
    return [...byCustomer.values()].sort(
      (a, b) =>
        Number(b.qtyOut > 0) - Number(a.qtyOut > 0) ||
        b.balance - a.balance ||
        a.customerName.localeCompare(b.customerName),
    );
  }, [rows, query, cutoff, tabs, view]);

  // Counted the same way the tabs filter, so the badges match what opens. They
  // overlap on purpose: a part-returned site is counted in both.
  const outCount = rows.filter((row) => row.qtyOut > 0).length;
  const returnedCount = rows.filter((row) => row.qtyReturned > 0).length;

  return (
    <div>
      {tabs && (
        <Segmented
          className="mb-3"
          options={[
            { href: '#out', label: 'Still out', active: view === 'out', count: outCount },
            {
              href: '#done',
              label: 'Returned',
              active: view === 'done',
              count: returnedCount,
            },
          ]}
          onSelect={(index) => setView(index === 0 ? 'out' : 'done')}
        />
      )}

      <div className="mb-3 flex gap-2">
        {/* No submit button: the rows are already here, so waiting for a tap to
            filter them would be theatre. */}
        <div className="relative flex-1">
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
            placeholder="Customer, site or mobile"
            aria-label="Search sites"
            className="tap w-full rounded-xl border border-rule bg-card pl-9 pr-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
          />
        </div>

        <div className="relative shrink-0">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as Range)}
            aria-label="Went out within"
            className="tap appearance-none rounded-xl border border-rule bg-card pl-3 pr-8 text-sm font-semibold outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
          >
            {RANGES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            aria-hidden
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={query.trim() ? `Nothing matches “${query}”` : emptyTitle} action={emptyAction}>
          {query.trim() ? 'Try the contractor’s name, the site, or part of the number.' : emptyBody}
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
                />

                <ul className="divide-y divide-rule">
                  {group.sites.map((row, index) => (
                    <li key={row.id}>
                      <Link
                        href={`${hrefPrefix}${row.id}`}
                        className="tap block px-4 py-2.5 transition-colors hover:bg-paper"
                      >
                        <SiteRow
                          index={index + 1}
                          siteName={row.siteName}
                          since={row.outSince}
                          days={row.daysOut}
                          perDay={row.perDay}
                          total={row.accruedRent}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
