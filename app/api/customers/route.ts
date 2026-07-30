import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { createCustomer, searchCustomers } from '@/lib/customers/service';
import { createCustomerSchema, customerSearchSchema } from '@/lib/validation/customers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'customer.manage');

  const url = new URL(request.url);
  const { q, limit } = customerSearchSchema.parse({
    q: url.searchParams.get('q') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });

  return ok({ customers: await searchCustomers(session, q, limit, today()) });
});

export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'customer.manage');

  const input = await parseBody(request, createCustomerSchema);

  return ok({ customer: await createCustomer(session, input) }, 201);
});
