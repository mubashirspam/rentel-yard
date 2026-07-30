/**
 * §08.1 /payments/new — record money received.
 *
 * Without an account in the URL this lists sites with something owing, so the
 * admin taps the contractor rather than searching for them.
 */

import Link from 'next/link';

import { PaymentForm } from '@/components/domain/payment-form';
import { EmptyState, List, PageHeader, RowLink, Screen } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { getAccountDetail, listAccounts } from '@/lib/accounts/service';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getMoneySummary } from '@/lib/payments/service';
import { orgName } from '@/lib/org';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const session = await requirePageSession('/payments/new');
  requireCapability(session, 'payment.create');

  const asOf = today();
  const { account: accountId } = await searchParams;

  if (!accountId) return <AccountChooser session={session} asOf={asOf} />;

  const [detail, summary, yardName] = await Promise.all([
    orNotFound(getAccountDetail(session, accountId, asOf)),
    getMoneySummary(session, accountId, asOf),
    orgName(session),
  ]);

  return (
    <Screen>
      <PageHeader
        back={{ href: `/accounts/${accountId}`, label: detail.account.siteName }}
        title="Record payment"
        subtitle="Money already received — cash, UPI, bank, or cheque"
      />
      <PaymentForm
        accountId={accountId}
        siteName={detail.account.siteName}
        customerName={detail.customer.name}
        customerMobile={detail.customer.mobile}
        yardName={yardName}
        balance={summary.balance}
        pendingOnBills={summary.pendingOnBills}
        today={asOf}
      />
    </Screen>
  );
}

async function AccountChooser({
  session,
  asOf,
}: {
  session: Awaited<ReturnType<typeof requirePageSession>>;
  asOf: string;
}) {
  const accounts = (await listAccounts(session, { status: 'all' }, asOf)).filter(
    (account) => account.balance > 0,
  );

  return (
    <Screen>
      <PageHeader title="Record payment" subtitle="Who has paid?" />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nobody owes anything"
          action={
            <Link
              href="/accounts"
              className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
            >
              All accounts
            </Link>
          }
        >
          Every open site is settled. A payment can still be recorded from the account screen.
        </EmptyState>
      ) : (
        <List>
          {accounts.map((account) => (
            <li key={account.id}>
              <RowLink href={`/payments/new?account=${account.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{account.customerName}</span>
                  <Money paise={account.balance} className="font-medium" />
                </div>
                <p className="mt-0.5 text-sm text-ink-2">{account.siteName}</p>
              </RowLink>
            </li>
          ))}
        </List>
      )}
    </Screen>
  );
}
