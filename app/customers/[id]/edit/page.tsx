/**
 * A contractor's own details — name, numbers, address, credit limit, blocked —
 * and the button that opens a site for them.
 *
 * Split out of `../page.tsx` in the redesign. These are settings: they change
 * once a year, and they sat directly beneath four tabs about today's work,
 * which made the screen that answers "what has he got out?" scroll past a form
 * to get there. Reached from the ⋯ in the hub's header.
 */

import { CustomerProfile } from '@/components/domain/customer-profile';
import { NewSite } from '@/components/domain/new-site';
import { Card, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getCustomerHub } from '@/lib/customers/hub';
import { formatMobile } from '@/lib/format';
import { formatPaise } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/customers/${id}/edit`);
  requireCapability(session, 'customer.manage');

  const asOf = today();
  const { customer, totals, overCreditLimit } = await orNotFound(
    getCustomerHub(session, id, asOf),
  );

  return (
    <Screen>
      <PageHeader
        back={{ href: `/customers/${id}`, label: customer.name }}
        title="Details"
        subtitle={`${customer.name} · ${formatMobile(customer.mobile)}`}
      />

      <Card className="p-4">
        <p className="text-sm font-medium text-ink-2">Owes across every site</p>
        <p className="tabular mt-0.5 text-2xl font-bold">
          <Money paise={totals.balance} />
        </p>
        {overCreditLimit && (
          <p className="mt-1 text-sm text-amber">
            Over the agreed limit of <Money paise={customer.creditLimit} />.
          </p>
        )}
      </Card>

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
