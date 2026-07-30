import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { recordMovementBatch } from '@/lib/movements/service';
import { movementBatchSchema } from '@/lib/validation/movements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One gate pass, many item lines, one `client_uuid` per line (§06). */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  const input = await parseBody(request, movementBatchSchema);

  return ok(await recordMovementBatch(session, input, today()), 201);
});
