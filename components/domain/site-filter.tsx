/**
 * The site filter on a contractor's account screen.
 *
 * Links, not client state. Choosing a site changes what the money sections
 * below are about — a bill belongs to one khata, and so do the ledger and
 * Close — so the selection has to be somewhere the server can read it. Each
 * site is simply its own account URL, which means a filtered view is
 * shareable, back works, and the screen keeps its one round trip.
 *
 * "All" is the customer-wide view: totals and everything out, no money
 * sections, because there is no single khata for them to belong to.
 */

import Link from 'next/link';

import type { CustomerSite } from '@/lib/accounts/service';

import { Money } from '../ui/money';

export function SiteFilter({
  sites,
  /** The account in the URL, or null when showing every site. */
  selectedId,
  allHref,
}: {
  sites: CustomerSite[];
  selectedId: string | null;
  allHref: string;
}) {
  return (
    <nav aria-label="Filter by site" className="-mx-4 mb-3 overflow-x-auto px-4">
      <ul className="flex w-max gap-1.5">
        <li>
          <Tab href={allHref} active={selectedId === null}>
            All {sites.length}
          </Tab>
        </li>
        {sites.map((site) => (
          <li key={site.accountId}>
            <Tab href={`/accounts/${site.accountId}`} active={site.accountId === selectedId}>
              <span className="truncate">{site.siteName}</span>
              {site.qtyOut > 0 && (
                <span className="tabular ml-1.5 text-[11px] opacity-75">{site.qtyOut}</span>
              )}
              {site.qtyOut === 0 && site.balance !== 0 && (
                <Money paise={site.balance} className="ml-1.5 text-[11px] opacity-75" />
              )}
            </Tab>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex max-w-44 items-center rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors ${
        active
          ? 'bg-steel text-white'
          : 'border border-rule bg-card text-ink-2 hover:bg-paper'
      }`}
    >
      {children}
    </Link>
  );
}
