import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { getCustomerDetail, updateCustomer } from '@/lib/customers/service';
import { updateCustomerSchema } from '@/lib/validation/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  const session = await requireSession();
  requireCapability(session, 'customer.manage');

  const { id } = await context.params;

  return ok(await getCustomerDetail(session, id, today()));
});

export const PATCH = handler(async (request: Request, context: Context) => {
  const session = await requireSession();
  requireCapability(session, 'customer.manage');

  const { id } = await context.params;
  const input = await parseBody(request, updateCustomerSchema);

  return ok({ customer: await updateCustomer(session, id, input) });
});
