import { handler, ok, parseBody } from '@/lib/api/respond';
import { listAccounts, openAccount } from '@/lib/accounts/service';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { accountSearchSchema, openAccountSchema } from '@/lib/validation/accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The account picker in the return flow and the /accounts list read this. */
export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'account.manage');

  const url = new URL(request.url);
  const filters = accountSearchSchema.parse({
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    customerId: url.searchParams.get('customerId') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  return ok({ accounts: await listAccounts(session, filters, today()) });
});

export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'account.manage');

  const input = await parseBody(request, openAccountSchema);

  return ok({ account: await openAccount(session, input) }, 201);
});
