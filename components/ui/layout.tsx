/**
 * Page furniture (§08.5).
 *
 * Dense, high contrast, one column at 360px. Colour appears only through
 * `Chip`, and only to carry state — green settled, amber pending, red overdue,
 * grey synced.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Fab } from './fab';
import { SyncBoot } from './sync-boot';
import { SyncChip } from './sync-chip';
import { TabBar } from './tab-bar';

/**
 * Every admin screen's outer wrapper. `pb-28` keeps the last row clear of the
 * bottom tab bar, which sits over the page on a phone.
 *
 * `fab` is opt-in rather than automatic: the floating button is one action now
 * (a lending), and a screen that is already about lending, or that has its own
 * primary button in the header, does not want it. See `./fab`.
 */
export function Screen({
  children,
  nav = true,
  fab = false,
}: {
  children: ReactNode;
  nav?: boolean;
  fab?: boolean;
}) {
  return (
    <>
      {/* §07.5: the sync state is persistent and on every screen, because the
          question "did that gate pass actually leave the phone?" has to be
          answerable without going looking. */}
      <SyncBoot />
      <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pt-3">
        <SyncChip />
      </div>
      <main className={`mx-auto w-full max-w-2xl px-4 py-5 ${fab ? 'pb-40' : 'pb-28'}`}>
        {children}
      </main>
      {nav && (
        <>
          {fab && <Fab />}
          <TabBar />
        </>
      )}
    </>
  );
}

const ACCENT = {
  neutral: 'bg-ink-3',
  steel: 'bg-steel',
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
} as const;

/**
 * The app bar.
 *
 * A phone app gives a screen one line of chrome: where you are, how to go back,
 * and at most one action. This was a card with a rule, a 2xl title and a
 * subtitle — furniture that pushed the actual work below the fold on a 360px
 * screen and made every screen feel like a document rather than an app.
 *
 * Sticky, because on a long account screen the way back should not require
 * scrolling to the top to find it.
 */
export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  /** One short line at most — anything longer belongs in the page. */
  subtitle?: ReactNode;
  /** Where the back link goes. Omit on a tab-bar destination. */
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 rounded-b-2xl border-b border-rule bg-card/95 px-4 backdrop-blur">
      <div className="flex h-14 items-center gap-2">
        {back && (
          <Link
            href={back.href}
            aria-label={`Back to ${back.label}`}
            className="tap -ml-2 flex h-11 w-9 shrink-0 items-center justify-center text-ink-2 hover:text-ink"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-ink-3">{subtitle}</p>}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/**
 * A flat card. No shadow anywhere in this product — a yard screen in daylight
 * needs contrast at the edges, not depth, and a page of floating rectangles
 * reads as noise. Separation is carried by the border and the paper background.
 */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-rule bg-card ${className}`}>{children}</div>;
}

/**
 * A section heading with a coloured rule.
 *
 * Ten sections of grey capitals down one page is a wall. The rule gives each
 * one a colour that means what it means everywhere else — steel for the yard's
 * own work, green settled, amber pending, red overdue — so a screen can be
 * scanned rather than read.
 */
export function SectionTitle({
  children,
  aside,
  tone = 'neutral',
}: {
  children: ReactNode;
  aside?: ReactNode;
  tone?: keyof typeof ACCENT;
}) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-2">
        <span aria-hidden className={`h-3.5 w-1 rounded-full ${ACCENT[tone]}`} />
        {children}
      </h2>
      {aside}
    </div>
  );
}

const CHIP_TONE = {
  neutral: 'bg-paper text-ink-2',
  steel: 'bg-steel-soft text-steel',
  green: 'bg-green-soft text-green',
  amber: 'bg-amber-soft text-amber',
  red: 'bg-red-soft text-red',
} as const;

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

const STAT_TONE = {
  neutral: 'text-ink',
  steel: 'text-steel',
  green: 'text-green',
  amber: 'text-amber',
  red: 'text-red',
} as const;

/**
 * One figure in the grid of four at the top of a screen.
 *
 * The label is small and grey, the number large and tabular, and the colour is
 * the state colour that number means everywhere else. A tile whose number is
 * zero goes grey whatever its tone: nothing owed is not an amber fact, and four
 * coloured tiles when three of them are ₹0 teaches an owner to stop reading
 * them.
 */
export function StatCard({
  label,
  value,
  tone = 'neutral',
  muted = false,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: keyof typeof STAT_TONE;
  /** Force the grey treatment — pass `paise === 0`. */
  muted?: boolean;
  hint?: ReactNode;
}) {
  return (
    <Card className="p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className={`tabular mt-0.5 text-lg font-bold ${muted ? 'text-ink-3' : STAT_TONE[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-3">{hint}</p>}
    </Card>
  );
}

const ALERT_TONE = {
  red: 'border-red/25 bg-red-soft text-red',
  amber: 'border-amber/25 bg-amber-soft text-amber',
} as const;

/**
 * One line of trouble, at the top of a screen, tappable to the place that
 * fixes it.
 *
 * The home screen used to give each kind of warning — negative stock, low
 * stock, over the credit limit, out for months — a heading and a full list, and
 * four lists of one row each pushed the day's actual work off the screen. A
 * warning's job is to say *there is a thing, here it is*; the list that details
 * it lives on the screen that resolves it.
 */
export function Alert({
  tone = 'red',
  title,
  detail,
  href,
}: {
  tone?: keyof typeof ALERT_TONE;
  title: ReactNode;
  detail?: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0" aria-hidden>
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <path d="M12 2l10 18H2L12 2zm-1 7v5h2V9h-2zm0 7v2h2v-2h-2z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {detail && <span className="block text-xs opacity-90">{detail}</span>}
      </span>
      {href && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          className="mt-0.5 h-4 w-4 shrink-0 opacity-60"
          aria-hidden
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
      )}
    </>
  );

  const className = `flex gap-2.5 rounded-2xl border px-3.5 py-2.5 ${ALERT_TONE[tone]}`;

  return href ? (
    <Link href={href} className={`tap items-center ${className}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

const STAMP_TONE = {
  red: 'text-red',
  green: 'text-green',
  amber: 'text-amber',
  neutral: 'text-ink-3',
} as const;

/**
 * The rubber stamp on the foot of a site block or an invoice — DUE, PAID, OUT,
 * CLOSED.
 *
 * A chip says what something *is*; a stamp says it has been *settled one way or
 * the other*, which is the distinction a yard's paperwork already makes. Ruled
 * in the current colour and tilted two degrees, so it reads at arm's length as
 * the outcome of a card rather than another label inside it.
 */
export function Stamp({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof STAMP_TONE;
}) {
  return (
    <span
      className={`tabular inline-block -rotate-2 rounded border-[1.5px] border-current px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STAMP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * §14: "an empty account screen invites the first issue; it does not say 'No
 * data'." Every empty state takes a line of copy and, where there is one, the
 * action that fills it.
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-5 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

/**
 * A row of a list, tappable to somewhere. 44px minimum by way of `tap`.
 *
 * `index` prints a serial number in the gutter. A yard counts things in order —
 * "the third site", "line 7" — and a numbered row can be pointed at over the
 * phone without reading the whole name out.
 */
export function RowLink({
  href,
  children,
  index,
}: {
  href: string;
  children: ReactNode;
  index?: number;
}) {
  return (
    <Link
      href={href}
      className="tap flex gap-3 px-4 py-3 transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-paper active:bg-paper"
    >
      {index !== undefined && (
        <span
          aria-hidden
          className="tabular mt-0.5 w-5 shrink-0 text-right text-xs font-semibold text-ink-3"
        >
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <Card>
      <ul className="divide-y divide-rule">{children}</ul>
    </Card>
  );
}
