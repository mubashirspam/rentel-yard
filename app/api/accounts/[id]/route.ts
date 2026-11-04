import { handler, ok, parseBody } from '@/lib/api/respond';
import { deleteAccount, getAccountDetail, updateAccount } from '@/lib/accounts/service';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { isIsoDate } from '@/lib/accrual';
import { updateAccountSchema } from '@/lib/validation/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'account.manage');

    const { id } = await context.params;

    // `asOf` lets a bill preview value the account at a period end. Defaults to
    // today, because rent keeps accruing until the equipment comes back.
    const requested = new URL(request.url).searchParams.get('asOf');
    const asOf = requested && isIsoDate(requested) ? requested : today();

    return ok(await getAccountDetail(session, id, asOf));
  },
);

type Context = { params: Promise<{ id: string }> };

/** Rename a site or change its address. */
export const PATCH = handler(async (request: Request, context: Context) => {
  const session = await requireSession();
  requireCapability(session, 'account.manage');

  const { id } = await context.params;
  const input = await parseBody(request, updateAccountSchema);

  return ok({ account: await updateAccount(session, id, input) });
});

/** Delete a site opened by mistake. Refused once it holds any history. */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const session = await requireSession();
  requireCapability(session, 'account.manage');

  const { id } = await context.params;

  return ok(await deleteAccount(session, id));
});
