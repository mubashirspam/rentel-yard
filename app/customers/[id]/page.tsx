/**
 * §08.1 /customers/[id] — profile · accounts · total due.
 *
 * "Share statement" needs a portal token, which is M6; the WhatsApp button here
 * sends a plain summary from the admin's own phone in the meantime (§09).
 */

import Link from 'next/link';

import { CustomerProfile } from '@/components/domain/customer-profile';
import { NewSite } from '@/components/domain/new-site';
import {
  Chip,
  EmptyState,
  List,
  PageHeader,
  RowLink,
  Screen,
  SectionTitle,
  Card,
} from '@/components/ui/layout';
import { BigMoney, Money, Qty } from '@/components/ui/money';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getCustomerDetail } from '@/lib/customers/service';
import { formatDayFull, formatDays, formatMobile, telHref, waHref } from '@/lib/format';
import { formatPaise } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/customers/${id}`);
  requireCapability(session, 'customer.manage');

  const asOf = today();
  const { customer, accounts, totalOutstanding } = await orNotFound(
    getCustomerDetail(session, id, asOf),
  );

  const openAccounts = accounts.filter((account) => account.status === 'open');
  const qtyOut = accounts.reduce((sum, account) => sum + account.qtyOut, 0);
  const overLimit = customer.creditLimit > 0 && totalOutstanding > customer.creditLimit;

  const summary = [
    `Bismi Rental — ${customer.name}`,
    ...openAccounts.map(
      (account) => `${account.siteName}: ${formatPaise(account.balance)} due, ${account.qtyOut} out`,
    ),
    `Total due: ${formatPaise(totalOutstanding)}`,
  ].join('\n');

  return (
    <Screen>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={customer.name}
        subtitle={formatMobile(customer.mobile)}
        action={
          customer.isBlocked ? <Chip tone="red">Blocked</Chip> : overLimit ? (
            <Chip tone="amber">Over limit</Chip>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <a
          href={telHref(customer.mobile)}
          className="tap inline-flex items-center rounded border border-rule bg-card px-3 font-medium"
        >
          Call
        </a>
        <a
          href={waHref(customer.mobile, summary)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded border border-rule bg-card px-3 font-medium"
        >
          WhatsApp summary
        </a>
      </div>

      <Card className="p-4">
        <p className="text-sm font-medium text-ink-2">Total due across every site</p>
        <BigMoney paise={totalOutstanding} tone={totalOutstanding > 0 ? 'due' : 'settled'} />
        <p className="mt-1 text-sm text-ink-2">
          {qtyOut > 0 ? (
            <>
              <Qty qty={qtyOut} /> still out · as of {formatDayFull(asOf)}
            </>
          ) : (
            <>Nothing out · as of {formatDayFull(asOf)}</>
          )}
        </p>
        {overLimit && (
          <p className="mt-2 text-sm text-amber">
            Over the agreed limit of <Money paise={customer.creditLimit} />.
          </p>
        )}
      </Card>

      <SectionTitle
        aside={
          !customer.isBlocked ? (
            <Link href="/issue" className="text-sm font-medium text-steel">
              Lend to a site
            </Link>
          ) : undefined
        }
      >
        Sites
      </SectionTitle>

      {accounts.length === 0 ? (
        <EmptyState title="No sites yet">
          A site opens the first time equipment goes out to it.
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => (
            <li key={account.id}>
              <RowLink href={`/accounts/${account.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {account.siteName}
                    {account.status === 'closed' && (
                      <>
                        {' '}
                        <Chip>Closed</Chip>
                      </>
                    )}
                  </span>
                  <Money paise={account.balance} className="font-medium" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>Opened {formatDayFull(account.openedOn)}</span>
                  <span>
                    {account.qtyOut > 0 ? (
                      <>
                        <Qty qty={account.qtyOut} /> out
                      </>
                    ) : (
                      'nothing out'
                    )}{' '}
                    · {formatDays(account.daysOpen)}
                  </span>
                </div>
              </RowLink>
            </li>
          ))}
        </List>
      )}

      {!customer.isBlocked && (
        <div className="mt-3">
          <NewSite customerId={customer.id} customerName={customer.name} today={asOf} />
        </div>
      )}

      <SectionTitle>Details</SectionTitle>
      <CustomerProfile
        customer={{
          id: customer.id,
          name: customer.name,
          mobile: customer.mobile,
          altMobile: customer.altMobile ?? '',
          address: customer.address ?? '',
          notes: customer.notes ?? '',
          creditLimit:
            customer.creditLimit > 0 ? formatPaise(customer.creditLimit, { symbol: false }) : '',
          creditLimitPaise: customer.creditLimit,
          isBlocked: customer.isBlocked,
        }}
      />
    </Screen>
  );
}
