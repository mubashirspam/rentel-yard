/**
 * §09 bill generation — pick a period, see every line, adjust, confirm.
 */

import { BillPreviewScreen } from '@/components/domain/bill-preview';
import { PageHeader, Screen } from '@/components/ui/layout';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { previewBill } from '@/lib/bills/service';
import { today } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/accounts/${id}/bill`);
  requireCapability(session, 'bill.issue');

  const asOf = today();
  const preview = await orNotFound(previewBill(session, id, {}, asOf));

  return (
    <Screen>
      <PageHeader
        back={{ href: `/accounts/${id}`, label: preview.siteName }}
        title="Generate bill"
        subtitle={`${preview.customerName} · ${preview.siteName}`}
      />
      <BillPreviewScreen accountId={id} initial={preview} today={asOf} />
    </Screen>
  );
}
