import { handler, ok } from '@/lib/api/respond';
import { getAccountDetail } from '@/lib/accounts/service';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { isIsoDate } from '@/lib/accrual';

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
