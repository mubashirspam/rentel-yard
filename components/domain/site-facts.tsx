/**
 * The two shapes every site list is built from.
 *
 * Lending, Returns, Accounts and the dashboard all answer the same question —
 * *whose kit is where, since when, and what has it earned?* — so they share the
 * contractor band and the site row beneath it. Four near-identical layouts
 * would disagree within a week, which is precisely how the tiles came to show
 * an account's age next to rent accrued over a different span.
 *
 * The row is two lines and no more. A phone in a yard shows six or seven sites
 * at once or it is not a list, it is a scroll; every line spent on a site is a
 * site the thumb has to travel past. So the figures sit on the site's own line,
 * right-aligned where money belongs, and the date goes quietly underneath.
 *
 * They carry no labels because each one already says what it is: a rate ends in
 * "/day", a span ends in "days", and the bold rupee figure at the end is the
 * total. That is also why the "35 out" chip is gone — the quantity was the one
 * number on the row nobody was reading, and it cost a whole line.
 */

import Link from 'next/link';

import { formatDayWeekday, formatDays, formatMobile, telHref, waHref } from '@/lib/format';

import { Chip } from '../ui/layout';
import { Money } from '../ui/money';

/**
 * The contractor's band across the top of a group.
 *
 * A yard asks "what has Ibrahim got out?" before it asks about any one site,
 * so the name, the count and what they owe sit above the sites rather than
 * being repeated on each one.
 */
export function CustomerBand({
  href,
  customerName,
  mobile,
  siteCount,
  balance,
  aside,
}: {
  /**
   * Where the contractor's name goes.
   *
   * Their *account*, not their profile card — `/accounts/{anySiteId}?site=all`
   * is the screen that answers "what has Ibrahim got and what does he owe",
   * and it is the same question this band is asking in miniature. The profile
   * (name, mobile, credit limit) is a settings page reached from there.
   */
  href: string;
  customerName: string;
  /** Omitted on screens that do not carry the number — the buttons vanish with it. */
  mobile?: string;
  siteCount: number;
  /** Paise. Positive means the contractor owes the yard. */
  balance: number;
  /** Anything extra for this screen — "to bill", say. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="border-b border-rule bg-steel-soft px-4 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <Link href={href} className="truncate font-semibold text-steel hover:underline">
            {customerName}
          </Link>
          {/* Full-strength steel: at 70% this sat on the pale steel band at
              barely two-to-one against it and read as a smudge. */}
          <span className="shrink-0 text-xs font-semibold text-steel">
            {siteCount} {siteCount === 1 ? 'site' : 'sites'}
          </span>
        </span>

        <span className="flex shrink-0 items-baseline gap-1.5">
          {aside}
          <Money
            paise={balance}
            className={`font-semibold ${balance > 0 ? 'text-red' : 'text-green'}`}
          />
        </span>
      </div>

      {/* Chasing a contractor is the commonest thing to want from a list of
          their sites, and it was previously two screens away. Both open the
          yard's own phone — §09 sends nothing by itself. */}
      {mobile && (
        <div className="mt-1 flex items-center gap-1.5">
          <a
            href={telHref(mobile)}
            aria-label={`Call ${customerName} on ${formatMobile(mobile)}`}
            className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-0.5 text-xs font-semibold text-steel hover:bg-paper"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3 w-3">
              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z" />
            </svg>
            Call
          </a>
          <a
            href={waHref(mobile, '')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp ${customerName}`}
            className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-0.5 text-xs font-semibold text-green hover:bg-paper"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3 w-3">
              <path d="M12 2a10 10 0 0 0-8.7 15L2 22l5.2-1.3A10 10 0 1 0 12 2zm5.1 14c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3-.8a10.6 10.6 0 0 1-4.3-3.9c-.3-.5-.8-1.4-.8-2.3s.5-1.4.7-1.6a.8.8 0 0 1 .6-.2h.4c.2 0 .4 0 .5.4l.7 1.7c0 .2 0 .3-.1.5l-.3.3c-.1.2-.3.3-.1.6a7 7 0 0 0 3.2 2.7c.3.2.5.1.6 0l.7-.8c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.3a2 2 0 0 1-.1.5z" />
            </svg>
            WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * One site: its name and its figures on the same line, the date under them.
 *
 * `since` and `days` come from the lots on site, never from the account record.
 * Backdating a lending is normal here — a lorry that left on Friday gets
 * entered on Monday — so the khata's own age says nothing about how long the
 * kit has been standing on somebody's plot.
 */
export function SiteRow({
  index,
  siteName,
  since,
  days,
  perDay,
  total,
  trailing,
}: {
  /** The serial in the gutter, so a row can be pointed at over the phone. */
  index: number;
  siteName: string;
  /** The oldest lot still out. Null when everything has come back. */
  since: string | null;
  days: number;
  /** Paise per day everything still out is accruing at. */
  perDay: number;
  /** Paise accrued so far — rent and damages. */
  total: number;
  /** Extra chips for this screen — "to bill", "closed". */
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="tabular shrink-0 text-xs font-semibold text-ink-2">{index}</span>
          <span className="truncate font-semibold">{siteName}</span>
        </span>

        {/* Per day × days ≈ total, and now they are figures that agree. They
            are not forced to reconcile exactly: a minimum-days floor (§03) can
            carry the total above the raw days, and lots that went out on
            different days each accrue from their own date. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-semibold">
          {perDay > 0 && (
            <span className="text-steel">
              <Money paise={perDay} paiseDigits />
              /day
            </span>
          )}
          {days > 0 && <Chip>{formatDays(days)}</Chip>}
          <Money paise={total} className="text-sm font-bold" />
        </span>
      </div>

      <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-ink-2">
        {since ? formatDayWeekday(since) : 'all back'}
        {trailing}
      </p>
    </>
  );
}
