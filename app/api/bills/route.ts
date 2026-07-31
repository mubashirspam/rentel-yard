import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { issueBill, previewBill } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { previewBillSchema, issueBillSchema } from '@/lib/validation/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** §09 preview — values a period and writes nothing. */
export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'bill.issue');

  const url = new URL(request.url);
  const input = previewBillSchema.parse({
    accountId: url.searchParams.get('accountId') ?? undefined,
    periodFrom: url.searchParams.get('periodFrom') ?? undefined,
    periodTo: url.searchParams.get('periodTo') ?? undefined,
    scope: url.searchParams.get('scope') ?? undefined,
  });

  return ok({
    preview: await previewBill(
      session,
      input.accountId,
      { periodFrom: input.periodFrom, periodTo: input.periodTo, scope: input.scope },
      today(),
    ),
  });
});

/** Freezes the period into an invoice. Immutable from here (§02, §09). */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'bill.issue');

  const input = await parseBody(request, issueBillSchema);

  return ok({ bill: await issueBill(session, input, today()) }, 201);
});
