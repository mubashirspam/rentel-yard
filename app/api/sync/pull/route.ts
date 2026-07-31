import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { pullChanges } from '@/lib/sync/pull';
import { syncPullSchema } from '@/lib/sync/protocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rows changed since the device's cursor (§07.3). */
export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  const url = new URL(request.url);
  const { cursor, limit } = syncPullSchema.parse({
    cursor: url.searchParams.get('cursor') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  return ok(await pullChanges(session, cursor, limit));
});
