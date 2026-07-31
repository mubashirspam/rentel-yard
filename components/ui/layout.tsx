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
 */
export function Screen({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      {/* §07.5: the sync state is persistent and on every screen, because the
          question "did that gate pass actually leave the phone?" has to be
          answerable without going looking. */}
      <SyncBoot />
      <div className="mx-auto flex w-full max-w-2xl justify-end px-4 pt-3">
        <SyncChip />
      </div>
      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-28">{children}</main>
      {nav && (
        <>
          <Fab />
          <TabBar />
        </>
      )}
    </>
  );
}

export function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Where the back link goes. Omit on a tab-bar destination. */
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex text-sm font-medium text-steel">
          ← {back.label}
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span aria-hidden className="mb-2 block h-1 w-10 rounded-full bg-steel" />
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
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

const ACCENT = {
  neutral: 'bg-ink-3',
  steel: 'bg-steel',
  green: 'bg-green',
  amber: 'bg-amber',
  red: 'bg-red',
} as const;

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
