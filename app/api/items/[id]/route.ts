import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { updateItem } from '@/lib/items/service';
import { updateItemSchema } from '@/lib/validation/items';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = handler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    // §05.2: only a super_admin edits the item master and its rates.
    requireCapability(session, 'item.manage');

    const { id } = await context.params;
    const input = await parseBody(request, updateItemSchema);

    return ok({ item: await updateItem(session, id, input) });
  },
);
