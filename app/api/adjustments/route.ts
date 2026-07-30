import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { addAdjustment } from '@/lib/payments/service';
import { addAdjustmentSchema } from '@/lib/validation/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A charge or credit outside the rent calculation (§09). Reason required. */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'adjustment.create');

  const input = await parseBody(request, addAdjustmentSchema);

  return ok({ adjustment: await addAdjustment(session, input, today()) }, 201);
});
