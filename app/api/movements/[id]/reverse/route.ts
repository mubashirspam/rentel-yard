import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { reverseMovement } from '@/lib/movements/service';
import { reverseMovementSchema } from '@/lib/validation/movements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Creates a REVERSAL. Requires a reason. Admin+ only (§02, §06). */
export const POST = handler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'movement.reverse');

    const { id } = await context.params;
    const input = await parseBody(request, reverseMovementSchema);

    return ok({ reversal: await reverseMovement(session, id, input, today()) }, 201);
  },
);
