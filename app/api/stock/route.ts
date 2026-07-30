import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  return ok({ stock: await listStock(session) });
});
