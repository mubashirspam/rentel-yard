import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { createItem, listItems } from '@/lib/items/service';
import { createItemSchema } from '@/lib/validation/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  // Every role that can record a movement needs the item list to do it.
  const session = await requireSession();
  requireCapability(session, 'movement.create');

  const includeInactive = new URL(request.url).searchParams.get('all') === '1';

  return ok({ items: await listItems(session, includeInactive) });
});

export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'item.manage');

  const input = await parseBody(request, createItemSchema);

  return ok({ item: await createItem(session, input) }, 201);
});
