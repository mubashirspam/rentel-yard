/**
 * Page furniture (§08.5).
 *
 * Dense, high contrast, one column at 360px. Colour appears only through
 * `Chip`, and only to carry state — green settled, amber pending, red overdue,
 * grey synced.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { TabBar } from './tab-bar';

/**
 * Every admin screen's outer wrapper. `pb-28` keeps the last row clear of the
 * bottom tab bar, which sits over the page on a phone.
 */
export function Screen({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-28">{children}</main>
      {nav && <TabBar />}
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
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded border border-rule bg-card ${className}`}>{children}</div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-2">{children}</h2>
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
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${CHIP_TONE[tone]}`}
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

/** A row of a list, tappable to somewhere. 44px minimum by way of `tap`. */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="tap block px-4 py-3 hover:bg-paper active:bg-paper">
      {children}
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
