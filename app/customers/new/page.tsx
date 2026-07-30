import { CustomerForm, EMPTY_CUSTOMER } from '@/components/domain/customer-form';
import { PageHeader, Screen } from '@/components/ui/layout';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewCustomerPage() {
  const session = await requirePageSession('/customers/new');
  requireCapability(session, 'customer.manage');

  return (
    <Screen>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title="New customer"
        subtitle="Name and mobile is enough — the rest can wait until the lorry has gone."
      />
      <CustomerForm initial={EMPTY_CUSTOMER} submitLabel="Add customer" />
    </Screen>
  );
}
