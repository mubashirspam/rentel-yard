import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { getBootstrap } from '@/lib/sync/bootstrap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything a device caches on first load (§06, §07.1). */
export const GET = handler(async () => {
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  return ok(await getBootstrap(session));
});
