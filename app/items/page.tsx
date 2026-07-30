import { PageHeader, Screen } from '@/components/ui/layout';
import { can, requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { listStock } from '@/lib/stock/service';

import { ItemsScreen } from './items-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ItemsPage() {
  const session = await requirePageSession('/items');

  // Rendering the page at all is an `item.manage` decision — same map as the API.
  if (!can(session, 'item.manage')) {
    return (
      <Screen>
        <PageHeader title="Items" back={{ href: '/stock', label: 'Stock' }} />
        <p className="text-ink-2">
          Only a super admin sets rates and quantities. The stock screen shows what is available.
        </p>
      </Screen>
    );
  }

  requireCapability(session, 'item.manage');

  return (
    <Screen>
      <PageHeader
        back={{ href: '/stock', label: 'Stock' }}
        title="Items"
        subtitle="What the yard hires out, and what it charges"
      />
      <ItemsScreen initialItems={await listStock(session)} />
    </Screen>
  );
}
