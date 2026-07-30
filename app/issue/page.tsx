/**
 * §08.3 fast issue. Arriving with `?account=` skips straight to the items.
 */

import { IssueForm, type IssueTarget } from '@/components/domain/issue-form';
import { PageHeader, Screen } from '@/components/ui/layout';
import { getAccountDetail } from '@/lib/accounts/service';
import { requireCapability, type StaffSession } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { ERROR_CODES, isLedgerError } from '@/lib/errors';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function IssuePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const session = await requirePageSession('/issue');
  requireCapability(session, 'movement.create');

  const asOf = today();
  const { account: accountId } = await searchParams;

  const [stock, target] = await Promise.all([
    listStock(session),
    accountId ? findTarget(session, accountId, asOf) : Promise.resolve(undefined),
  ]);

  return (
    <Screen>
      <PageHeader
        title="Issue"
        subtitle="Equipment leaving the yard. Rent starts on the date you record."
        back={target ? { href: `/accounts/${target.accountId}`, label: target.siteName } : undefined}
      />
      <IssueForm items={stock} today={asOf} initialTarget={target} />
    </Screen>
  );
}

/**
 * The account named in the URL, or nothing — an unknown id, a closed site, or
 * another org's account (D22) all fall back to the full customer → site flow
 * rather than an error page.
 */
async function findTarget(
  session: StaffSession,
  accountId: string,
  asOf: string,
): Promise<IssueTarget | undefined> {
  const detail = await getAccountDetail(session, accountId, asOf).catch((error: unknown) => {
    if (isLedgerError(error) && error.code === ERROR_CODES.NOT_FOUND) return null;
    throw error;
  });

  if (!detail || detail.account.status !== 'open') return undefined;

  return {
    accountId: detail.account.id,
    siteName: detail.account.siteName,
    customerName: detail.customer.name,
    customerMobile: detail.customer.mobile,
  };
}
