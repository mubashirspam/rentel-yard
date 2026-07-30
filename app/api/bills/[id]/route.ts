import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { getBill } from '@/lib/bills/service';
import { today } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'money.view');

    const { id } = await context.params;

    return ok({ bill: await getBill(session, id, today()) });
  },
);
