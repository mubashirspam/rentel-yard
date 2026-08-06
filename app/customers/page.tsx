/**
 * Every contractor, one card each. The screen `/accounts` used to be.
 *
 * `/accounts` grouped khatas under names and split them billed / not billed;
 * this was a thin list of names with a balance. Two lists of the same people,
 * a tab apart, neither of which was the place you went to *do* anything —
 * because the doing was on a third screen. Now there is one list, the card is
 * the same one Home shows, and tapping it lands on the person's whole story.
 *
 * The billed / not-billed split survives as the **To bill** segment, which is
 * the question it was really asking: *whose finished work has nobody
 * invoiced?* Closed sites count in it, because a site that gave everything
 * back and was never billed is exactly what that segment is for.
 *
 * Search stays a plain GET form and the segment a plain link (D37): both live
 * in the URL, so back works, a filtered list is shareable, and neither needs
 * JavaScript when the service worker is serving a stale shell.
 */

import Link from 'next/link';

import { CustomerCard } from '@/components/domain/customer-card';
import { Chip, EmptyState, PageHeader, Screen } from '@/components/ui/layout';
import { Segmented } from '@/components/ui/segmented';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { listCustomerCards, type CustomerCardFacts } from '@/lib/customers/cards';
import { searchCustomers } from '@/lib/customers/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Show = 'out' | 'bill' | 'all';

const SHOWS: Array<{ key: Show; label: string; keep: (facts: CustomerCardFacts) => boolean }> = [
  { key: 'out', label: 'Out now', keep: (facts) => facts.sitesOut > 0 },
  { key: 'bill', label: 'To bill', keep: (facts) => facts.unbilled > 0 },
  { key: 'all', label: 'Everyone', keep: () => true },
];

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const session = await requirePageSession('/customers');
  requireCapability(session, 'customer.manage');

  const { q, show } = await searchParams;
  const asOf = today();
  const view: Show = SHOWS.some((option) => option.key === show) ? (show as Show) : 'out';

  /*
   * The roster and the figures come from two places on purpose. `searchCustomers`
   * knows every contractor — including one added this morning who has never
   * taken anything out, and who has no khata for `listCustomerCards` to find —
   * while the cards' arithmetic is derived in exactly one place so this screen
   * and Home cannot disagree about what somebody owes.
   */
  const [roster, cards] = await Promise.all([
    searchCustomers(session, q, 100, asOf),
    listCustomerCards(session, asOf),
  ]);

  const byId = new Map(cards.map((card) => [card.customerId, card]));

  const all = roster.map((customer) => ({
    customer,
    facts: byId.get(customer.id) ?? {
      customerId: customer.id,
      customerName: customer.name,
      customerMobile: customer.mobile,
      balance: customer.balance,
      qtyOut: customer.qtyOut,
      perDay: 0,
      sitesOut: 0,
      siteCount: 0,
      unbilled: 0,
    },
  }));

  const counts = {
    out: all.filter((row) => SHOWS[0].keep(row.facts)).length,
    bill: all.filter((row) => SHOWS[1].keep(row.facts)).length,
    all: all.length,
  };

  const keep = SHOWS.find((option) => option.key === view)!.keep;
  const shown = all.filter((row) => keep(row.facts));

  const query = q ? `&q=${encodeURIComponent(q)}` : '';

  return (
    <Screen>
      <PageHeader
        title="Customers"
        action={
          <Link
            href="/customers/new"
            className="tap inline-flex items-center rounded-xl bg-steel px-4 font-medium text-white"
          >
            New
          </Link>
        }
      />

      <form action="/customers" className="mb-3 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Name or mobile"
          aria-label="Search customers"
          className="tap w-full rounded-xl border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        {/* Carries the segment through the search, so filtering then searching
            does not silently drop you back onto a different list. */}
        <input type="hidden" name="show" value={view} />
        <button type="submit" className="tap rounded-xl bg-steel px-4 font-medium text-white">
          Search
        </button>
      </form>

      <Segmented
        className="mb-3"
        options={SHOWS.map((option) => ({
          href: `/customers?show=${option.key}${query}`,
          label: option.label,
          active: option.key === view,
          count: counts[option.key],
        }))}
      />

      {shown.length === 0 ? (
        <EmptyState
          title={
            q
              ? `Nobody matches “${q}”`
              : view === 'out'
                ? 'Nobody is holding equipment'
                : view === 'bill'
                  ? 'Nothing is waiting to be billed'
                  : 'No customers yet'
          }
          action={
            view === 'all' && !q ? (
              <Link
                href="/customers/new"
                className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
              >
                Add a customer
              </Link>
            ) : (
              <Link
                href={`/customers?show=all${query}`}
                className="tap inline-flex items-center rounded-xl border border-rule bg-card px-4 py-2 font-medium"
              >
                Show everyone
              </Link>
            )
          }
        >
          {q
            ? 'Try part of the name, or the last few digits of the mobile number.'
            : view === 'out'
              ? 'Every item in the yard is in the yard.'
              : view === 'bill'
                ? 'Every rupee accrued is already on an invoice.'
                : 'A contractor is added the first time they take equipment out.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {shown.map(({ customer, facts }) => (
            <li key={customer.id}>
              {(customer.isBlocked || customer.overCreditLimit) && (
                <div className="mb-1 flex gap-1.5 px-1">
                  {customer.isBlocked && <Chip tone="red">Blocked</Chip>}
                  {customer.overCreditLimit && <Chip tone="amber">Over limit</Chip>}
                </div>
              )}
              <CustomerCard facts={facts} />
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
