import { handler, ok, parseBody } from '@/lib/api/respond';
import { defaultAccount } from '@/lib/accounts/service';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { z } from 'zod';
import { uuid } from '@/lib/validation/common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ customerId: uuid });

/** The customer's General khata, created on first use. Idempotent. */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'account.manage');

  const { customerId } = await parseBody(request, schema);

  return ok({ account: await defaultAccount(session, customerId, today()) });
});
