/**
 * Every khata, grouped under its contractor and split by what still needs an
 * invoice — see `AccountGroups` for why that beats open / closed.
 */

import { AccountGroups } from '@/components/domain/account-groups';
import { PageHeader, Screen } from '@/components/ui/layout';
import { listAccounts } from '@/lib/accounts/service';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { billedRentByAccount } from '@/lib/bills/service';
import { today } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await requirePageSession('/accounts');
  requireCapability(session, 'account.manage');

  const asOf = today();

  // Everything, open and closed: a closed site carrying unbilled rent is
  // exactly what this screen exists to surface.
  const accounts = await listAccounts(session, { status: 'all' }, asOf);
  const billed = await billedRentByAccount(
    session,
    accounts.map((account) => account.id),
  );

  return (
    <Screen>
      <PageHeader title="Accounts" />

      <AccountGroups
        rows={accounts.map((account) => ({
          id: account.id,
          customerId: account.customerId,
          customerName: account.customerName,
          customerMobile: account.customerMobile,
          siteName: account.siteName,
          balance: account.balance,
          qtyOut: account.qtyOut,
          perDay: account.perDay,
          outSince: account.outSince,
          daysOut: account.daysOut,
          accruedRent: account.accruedRent,
          billed: billed.get(account.id) ?? 0,
          status: account.status,
        }))}
      />
    </Screen>
  );
}
