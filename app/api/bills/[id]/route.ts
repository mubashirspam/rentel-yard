import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { billPayInfo } from '@/lib/bills/pay-info';
import { getBill } from '@/lib/bills/service';
import { loadPaymentDetails } from '@/lib/settings/service';
import { today } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'money.view');

    const { id } = await context.params;

    const bill = await getBill(session, id, today());
    // D70: the public pay page and UPI link for the WhatsApp message.
    const pay = billPayInfo(bill, await loadPaymentDetails(session.orgId));

    return ok({ bill, pay });
  },
);
