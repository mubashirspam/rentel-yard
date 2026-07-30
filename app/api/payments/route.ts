import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { recordPayment } from '@/lib/payments/service';
import { recordPaymentSchema } from '@/lib/validation/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records money already received in the yard — cash, UPI, bank, or cheque.
 * No gateway is involved and nothing is collected through this route (§09).
 * Allocation to bills is oldest-first and automatic (§03.4).
 */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'payment.create');

  const input = await parseBody(request, recordPaymentSchema);

  return ok(await recordPayment(session, input, today()), 201);
});
