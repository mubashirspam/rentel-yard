import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { applySyncPush } from '@/lib/sync/push';
import { syncPushSchema } from '@/lib/sync/protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Drain a device's outbox (§07.2).
 *
 * Always 200 when the request itself was well formed: a business rejection is
 * per-entry data in the response, not an HTTP failure, because the other
 * entries in the same push did commit and the device must not retry them.
 */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  const input = await parseBody(request, syncPushSchema);

  return ok(await applySyncPush(session, input, today()));
});
