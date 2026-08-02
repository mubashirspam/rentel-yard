'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { AccountListRow } from '@/lib/accounts/service';
import { formatDay, formatDays } from '@/lib/format';

import { Card, Chip, EmptyState } from '../ui/layout';
import { Money, Qty } from '../ui/money';
import { Segmented } from '../ui/segmented';

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

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');

    return rows.filter((row) => {
      if (tabs && (view === 'out' ? row.qtyOut === 0 : row.qtyOut > 0)) return false;
      if (cutoff && row.openedOn < cutoff) return false;
      if (!term) return true;

      return (
        row.customerName.toLowerCase().includes(term) ||
        row.siteName.toLowerCase().includes(term) ||
        (digits.length >= 3 && row.customerMobile.includes(digits))
      );
    });
  }, [rows, query, cutoff, tabs, view]);

  const outCount = rows.filter((row) => row.qtyOut > 0).length;

  return (
    <div>
      {tabs && (
        <Segmented
          className="mb-3"
          options={[
            { href: '#out', label: 'Still out', active: view === 'out', count: outCount },
            {
              href: '#done',
              label: 'Completed',
              active: view === 'done',
              count: rows.length - outCount,
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
            aria-label="Opened within"
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

      {visible.length === 0 ? (
        <EmptyState title={query.trim() ? `Nothing matches “${query}”` : emptyTitle} action={emptyAction}>
          {query.trim() ? 'Try the contractor’s name, the site, or part of the number.' : emptyBody}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((row, index) => (
            <li key={row.id}>
              <Link href={`${hrefPrefix}${row.id}`} className="tap block">
                <Card className="p-3 transition-colors hover:bg-paper">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="tabular shrink-0 text-xs font-semibold text-ink-3">
                        {index + 1}
                      </span>
                      <span className="truncate font-semibold">{row.customerName}</span>
                    </span>
                    <Money
                      paise={row.balance}
                      className={`shrink-0 font-semibold ${row.balance > 0 ? 'text-red' : 'text-green'}`}
                    />
                  </div>

                  <p className="mt-0.5 truncate text-sm text-ink-2">{row.siteName}</p>

                  {/* The four facts that decide what happens next: how much is
                      out, how long it has been out, what it costs a day, and
                      what has accrued so far. */}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {row.qtyOut > 0 ? (
                      <Chip tone="amber">
                        <Qty qty={row.qtyOut} /> out
                      </Chip>
                    ) : (
                      <Chip tone="green">✓ all back</Chip>
                    )}
                    <Chip>{formatDays(row.daysOpen)}</Chip>
                    {row.perDay > 0 && (
                      <Chip tone="steel">
                        <Money paise={row.perDay} paiseDigits />
                        /day
                      </Chip>
                    )}
                    <Chip>
                      rent <Money paise={row.accruedRent} />
                    </Chip>
                    <Chip>since {formatDay(row.openedOn)}</Chip>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
