import { handler, ok, parseBody } from '@/lib/api/respond';
import { closeAccount } from '@/lib/accounts/service';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { closeAccountSchema } from '@/lib/validation/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rejects unless every item on the account is back (§02, §06). */
export const POST = handler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'account.manage');

    const { id } = await context.params;
    const input = await parseBody(request, closeAccountSchema);

    return ok({ account: await closeAccount(session, id, input) });
  },
);
