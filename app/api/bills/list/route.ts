import { and, eq } from 'drizzle-orm';

import { handler, ok } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { listBillsForAccounts } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { db, schema } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every issued bill, newest first, with the site and customer it went to —
 * the mobile Bills tab. `?accountId=` narrows to one site, `?status=` to one
 * payment status.
 */
export const GET = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'money.view');

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');
  const status = url.searchParams.get('status');

  const accounts = await db()
    .select({
      id: schema.accounts.id,
      siteName: schema.accounts.siteName,
      customerId: schema.customers.id,
      customerName: schema.customers.name,
      customerMobile: schema.customers.mobile,
    })
    .from(schema.accounts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .where(
      accountId
        ? and(eq(schema.accounts.orgId, session.orgId), eq(schema.accounts.id, accountId))
        : eq(schema.accounts.orgId, session.orgId),
    );

  const byAccount = await listBillsForAccounts(
    session,
    accounts.map((a) => a.id),
    today(),
  );

  const bills = accounts
    .flatMap((a) =>
      (byAccount.get(a.id) ?? []).map((bill) => ({
        ...bill,
        accountId: a.id,
        siteName: a.siteName,
        customerId: a.customerId,
        customerName: a.customerName,
        customerMobile: a.customerMobile,
      })),
    )
    .filter((bill) => !status || bill.status === status)
    .sort((x, y) => String(y.issuedAt).localeCompare(String(x.issuedAt)));

  return ok({ bills });
});
