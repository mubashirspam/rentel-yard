/**
 * §08.1 /customers — search, list with outstanding.
 */

import Link from 'next/link';

import { Chip, EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { searchCustomers } from '@/lib/customers/service';
import { formatMobile } from '@/lib/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePageSession('/customers');
  requireCapability(session, 'customer.manage');

  const { q } = await searchParams;
  const customers = await searchCustomers(session, q, 50, today());

  return (
    <Screen>
      <PageHeader
        title="Customers"
        subtitle="Contractors on the yard's books"
        action={
          <Link
            href="/customers/new"
            className="tap inline-flex items-center rounded bg-steel px-4 font-medium text-white"
          >
            New
          </Link>
        }
      />

      <form action="/customers" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Name or mobile"
          aria-label="Search customers"
          className="tap w-full rounded border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button type="submit" className="tap rounded bg-steel px-4 font-medium text-white">
          Search
        </button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          title={q ? `Nobody matches “${q}”` : 'No customers yet'}
          action={
            <Link
              href="/customers/new"
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Add a customer
            </Link>
          }
        >
          {q
            ? 'Try part of the name, or the last few digits of the mobile number.'
            : 'A contractor is added the first time they take equipment out.'}
        </EmptyState>
      ) : (
        <List>
          {customers.map((customer) => (
            <li key={customer.id}>
              <RowLink href={`/customers/${customer.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {customer.name}
                    {customer.isBlocked && (
                      <>
                        {' '}
                        <Chip tone="red">Blocked</Chip>
                      </>
                    )}
                    {customer.overCreditLimit && (
                      <>
                        {' '}
                        <Chip tone="amber">Over limit</Chip>
                      </>
                    )}
                  </span>
                  <Money paise={customer.balance} className="font-medium" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>{formatMobile(customer.mobile)}</span>
                  <span>
                    {customer.openAccounts > 0
                      ? `${customer.openAccounts} open site${customer.openAccounts === 1 ? '' : 's'}`
                      : 'no open sites'}
                    {customer.qtyOut > 0 && (
                      <>
                        {' · '}
                        <Qty qty={customer.qtyOut} /> out
                      </>
                    )}
                  </span>
                </div>
              </RowLink>
            </li>
          ))}
        </List>
      )}
    </Screen>
  );
}
