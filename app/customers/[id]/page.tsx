/**
 * The customer hub — one contractor's whole story on one screen.
 *
 * The screen this redesign exists for. Answering *"what has Ibrahim got, what
 * does he owe, and what still needs an invoice?"* used to mean four
 * destinations: the dashboard for his active sites, `/accounts` for the
 * billed/unbilled split, `/accounts/[id]` for one site's money, and this page
 * for his profile. The same person, four card designs, four round trips, and
 * nowhere that held all of it at once.
 *
 * Now the person is the screen and the questions are tabs inside it:
 *
 *   **Out now** — what is on which site, tap a line to take it back.
 *   **To bill** — finished hire nobody has invoiced, with the button that does.
 *   **Billed** — every invoice he holds, and what is still owed on it.
 *   **Returned** — sites holding nothing, kept as history.
 *
 * All four panels render here, on the server, and are handed to a client
 * `Tabs` that only decides which is visible (D38). So the whole contractor
 * costs one `getCustomerHub` — see `lib/customers/hub.ts` for why that is a
 * handful of queries and not one per site — and switching tabs costs nothing
 * and works with no signal.
 *
 * Editing the contractor's own details moved to `./edit`. It is a settings
 * page, and putting a form for a credit limit under four tabs about today's
 * work was what made the old screen feel like a filing cabinet.
 */

import Link from 'next/link';

import { OutBySite } from '@/components/domain/out-by-site';
import { Alert, Card, EmptyState, PageHeader, Screen, Stamp } from '@/components/ui/layout';
import { Money, Qty } from '@/components/ui/money';
import { Tabs } from '@/components/ui/tabs';
import { can, requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { today } from '@/lib/clock';
import { getCustomerHub, type CustomerHub, type HubSite } from '@/lib/customers/hub';
import { formatDay, formatDayFull, formatDays, formatMobile, telHref, waHref } from '@/lib/format';
import { statementMessage } from '@/lib/messages';
import { formatPaise } from '@/lib/money';
import { orgName } from '@/lib/org';
import { messageLanguage } from '@/lib/settings/service';
import { WORDS } from '@/lib/vocabulary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A bill's payment status as a stamp: settled, still owed, or late. */
const STAMP_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'amber',
  overdue: 'red',
} as const;

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/customers/${id}`);
  requireCapability(session, 'customer.manage');

  const asOf = today();
  const hub = await orNotFound(getCustomerHub(session, id, asOf));
  const { customer, sites, totals } = hub;

  const showMoney = can(session, 'money.view');
  const [yardName, language] = await Promise.all([orgName(session), messageLanguage(session)]);

  const holding = sites.filter((site) => site.qtyOut > 0);
  const toBill = sites.filter((site) => site.unbilled > 0);
  const returned = sites.filter((site) => site.qtyOut === 0);
  const bills = sites
    .flatMap((site) => site.bills.map((bill) => ({ bill, site })))
    .sort((a, b) => b.bill.periodTo.localeCompare(a.bill.periodTo));

  /*
   * One message for the whole contractor, not one per khata. Standing in front
   * of him the yard owes him a summary of every job (§09); a single site's
   * statement is on that site's own screen.
   */
  const message =
    holding.length === 1
      ? statementMessage({
          language,
          yardName,
          customerName: customer.name,
          siteName: holding[0].siteName,
          outstandingItems: holding[0].outstanding.map((line) => ({
            itemName: line.itemName,
            qtyOut: line.qtyOut,
          })),
          balance: holding[0].balance,
          asOf,
        })
      : [
          `${yardName} — ${customer.name}`,
          ...sites
            .filter((site) => site.qtyOut > 0 || site.balance !== 0)
            .map((site) => `${site.siteName}: ${formatPaise(site.balance)} due, ${site.qtyOut} out`),
          `Total due: ${formatPaise(totals.balance)}`,
        ].join('\n');

  return (
    <Screen>
      <PageHeader
        back={{ href: '/customers', label: 'Customers' }}
        title={customer.name}
        subtitle={
          <>
            {formatMobile(customer.mobile)} · {totals.siteCount}{' '}
            {totals.siteCount === 1 ? 'site' : 'sites'}
          </>
        }
        action={
          <Link
            href={`/customers/${customer.id}/edit`}
            aria-label={`Edit ${customer.name}`}
            className="tap flex w-11 items-center justify-center text-ink-2 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
            </svg>
          </Link>
        }
      />

      {(customer.isBlocked || hub.overCreditLimit) && (
        <div className="mb-3 space-y-2">
          {customer.isBlocked && (
            <Alert
              title={`${customer.name} is blocked`}
              detail="Nothing new goes out until this is lifted."
              href={`/customers/${customer.id}/edit`}
            />
          )}
          {hub.overCreditLimit && (
            <Alert
              tone="amber"
              title="Over the agreed credit limit"
              detail={
                <>
                  Owes <Money paise={totals.balance} /> against a limit of{' '}
                  <Money paise={customer.creditLimit} />.
                </>
              }
              href={`/customers/${customer.id}/edit`}
            />
          )}
        </div>
      )}

      {/* The contractor's own number, above any one site's. */}
      {showMoney && (
        <Card className="border-steel/20 bg-gradient-to-br from-steel to-steel-strong p-4 text-white">
          <p className="text-sm font-medium text-white/80">Total due, all sites</p>
          <span className="tabular text-3xl font-bold tracking-tight">
            {formatPaise(totals.balance)}
          </span>
          <p className="mt-1 text-sm text-white/80">
            {totals.qtyOut > 0 ? (
              <>
                <Qty qty={totals.qtyOut} /> out across {totals.sitesOut}{' '}
                {totals.sitesOut === 1 ? 'site' : 'sites'}
                {totals.perDay > 0 && (
                  <>
                    {' · '}
                    <Money paise={totals.perDay} paiseDigits />
                    /day
                  </>
                )}
              </>
            ) : (
              <>Nothing out · as of {formatDayFull(asOf)}</>
            )}
          </p>
        </Card>
      )}

      {/* Tap to call, tap to WhatsApp, tap to lend — the three things an admin
          does with a contractor while standing at the gate (§08.2). */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <a
          href={telHref(customer.mobile)}
          className="tap flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-card font-semibold"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .57 3.6 1 1 0 0 1-.25 1z" />
          </svg>
          Call
        </a>
        <a
          href={waHref(customer.mobile, message)}
          target="_blank"
          rel="noreferrer"
          className="tap flex items-center justify-center gap-1.5 rounded-xl border border-rule bg-card font-semibold text-green"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.4 14.1c-.23.64-1.33 1.22-1.84 1.27-.5.05-1.13.24-3.8-.8-3.2-1.26-5.24-4.53-5.4-4.74-.16-.21-1.3-1.73-1.3-3.3s.82-2.34 1.11-2.66c.29-.32.63-.4.84-.4h.6c.2 0 .46-.07.71.55l.98 2.36c.08.18.14.4.03.63l-.4.6-.56.6c-.17.18-.36.37-.16.72.2.35.9 1.5 1.94 2.42 1.33 1.19 2.45 1.56 2.8 1.73.35.18.55.15.76-.09l1.16-1.35c.27-.32.5-.25.85-.15l2.26.9c.35.17.58.26.67.4.08.15.08.85-.15 1.5z" />
          </svg>
          WhatsApp
        </a>
        {customer.isBlocked ? (
          <span className="tap flex items-center justify-center rounded-xl border border-rule bg-paper font-semibold text-ink-3">
            Blocked
          </span>
        ) : (
          <Link
            href={`/issue?customer=${customer.id}`}
            className="tap flex items-center justify-center gap-1.5 rounded-xl bg-steel font-semibold text-white hover:bg-steel-strong"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-4 w-4"
              aria-hidden
            >
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            {WORDS.lend}
          </Link>
        )}
      </div>

      <div className="mt-4">
        <Tabs
          initial={holding.length === 0 && toBill.length > 0 ? 1 : 0}
          tabs={[
            {
              label: 'Out now',
              count: holding.length,
              panel: <OutNowPanel hub={hub} holding={holding} />,
            },
            {
              label: 'To bill',
              count: toBill.length,
              panel: <ToBillPanel sites={toBill} canBill={showMoney && can(session, 'bill.issue')} />,
            },
            {
              label: 'Billed',
              count: bills.length,
              panel: (
                <BilledPanel
                  rows={bills}
                  canPay={showMoney && can(session, 'payment.create')}
                  show={showMoney}
                />
              ),
            },
            {
              label: 'Returned',
              count: returned.length,
              panel: <ReturnedPanel sites={returned} customerName={customer.name} />,
            },
          ]}
        />
      </div>
    </Screen>
  );
}

/** Tab 1 — what is on a site right now. Every line taps through to a return. */
function OutNowPanel({ hub, holding }: { hub: CustomerHub; holding: HubSite[] }) {
  if (holding.length === 0) {
    return (
      <EmptyState
        title={`${hub.customer.name} is holding nothing`}
        action={
          hub.customer.isBlocked ? undefined : (
            <Link
              href={`/issue?customer=${hub.customer.id}`}
              className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
            >
              {WORDS.lend} equipment
            </Link>
          )
        }
      >
        Every item across all {hub.totals.siteCount}{' '}
        {hub.totals.siteCount === 1 ? 'site' : 'sites'} has come back.
      </EmptyState>
    );
  }

  return (
    <>
      <p className="mb-2 text-xs text-ink-2">
        Tap a line to take it back · tap a site name for its ledger.
      </p>
      <OutBySite
        sites={holding}
        minimumDays={hub.minimumDays}
        siteHref={(accountId) => `/accounts/${accountId}`}
      />
    </>
  );
}

/**
 * Tab 2 — rent that has accrued and is on no invoice, per site, with the button
 * that raises one.
 *
 * A figure and a button, not a list: "what is not billed" has one answer per
 * site and one thing to do about it (`AccountGroups` used to say the same in a
 * whole screen of its own).
 */
function ToBillPanel({ sites, canBill }: { sites: HubSite[]; canBill: boolean }) {
  if (sites.length === 0) {
    return (
      <EmptyState title="Nothing waiting to be billed">
        Every rupee accrued on this contractor is already on an invoice.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2.5">
      {sites.map((site) => (
        <li key={site.accountId}>
          <Card className="border-amber/25 bg-amber-soft p-4 text-center">
            <p className="text-xs font-semibold text-amber">
              {site.siteName} · accrued, on no invoice yet
            </p>
            <p className="tabular mt-0.5 text-2xl font-bold text-amber">
              <Money paise={site.unbilled} />
            </p>
            <p className="mt-1 text-xs text-amber/80">
              {site.qtyOut > 0
                ? `${site.qtyOut} still out — finished hire bills now, the rest when it comes back`
                : 'All returned — ready to bill in full'}
              {site.billed > 0 && (
                <>
                  {' · '}
                  <Money paise={site.billed} /> billed so far
                </>
              )}
            </p>
            {canBill && (
              <Link
                href={`/accounts/${site.accountId}/bill`}
                className="tap mt-3 flex items-center justify-center rounded-xl bg-amber font-semibold text-white hover:opacity-90"
              >
                Generate bill for {site.siteName}
              </Link>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Tab 3 — every invoice the contractor holds, newest period first. */
function BilledPanel({
  rows,
  canPay,
  show,
}: {
  rows: Array<{ bill: HubSite['bills'][number]; site: HubSite }>;
  canPay: boolean;
  show: boolean;
}) {
  if (!show) {
    return <EmptyState title="Bills are not yours to see">Ask a super admin for access.</EmptyState>;
  }

  if (rows.length === 0) {
    return (
      <EmptyState title="No invoices yet">
        Rent accrues from the day equipment leaves. Anything waiting shows under{' '}
        <b>To bill</b>.
      </EmptyState>
    );
  }

  const owed = rows.reduce((sum, row) => sum + row.bill.outstanding, 0);

  return (
    <>
      <ul className="space-y-2.5">
        {rows.map(({ bill, site }) => (
          <li key={bill.id}>
            <Card className="overflow-hidden">
              <Link href={`/bills/${bill.id}`} className="tap block p-3 hover:bg-paper">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{bill.invoiceNo}</span>
                    <span className="block truncate text-xs text-ink-2">
                      {site.siteName} · {formatDay(bill.periodFrom)} →{' '}
                      {formatDayFull(bill.periodTo)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money paise={bill.grandTotal} className="block font-bold" />
                    <Stamp tone={STAMP_TONE[bill.status]}>{bill.status}</Stamp>
                  </span>
                </div>
              </Link>

              {bill.outstanding > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-rule bg-paper px-3 py-2">
                  <span className="text-sm text-ink-2">
                    <Money paise={bill.outstanding} className="font-semibold text-red" /> still owed
                  </span>
                  {canPay && (
                    <Link
                      href={`/payments/new?account=${site.accountId}`}
                      className="tap inline-flex items-center rounded-xl bg-green px-3 text-sm font-semibold text-white"
                    >
                      Record payment
                    </Link>
                  )}
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-ink-3">
        {owed === 0 ? (
          'Every invoice is settled.'
        ) : (
          <>
            <Money paise={owed} /> outstanding across {rows.length}{' '}
            {rows.length === 1 ? 'invoice' : 'invoices'}.
          </>
        )}
      </p>
    </>
  );
}

/**
 * Tab 4 — sites holding nothing.
 *
 * Finished work, kept where it can be found. A site with everything back is
 * *completed* rather than closed (D58), and it stays on the books because its
 * balance is still real money.
 */
function ReturnedPanel({ sites, customerName }: { sites: HubSite[]; customerName: string }) {
  if (sites.length === 0) {
    return (
      <EmptyState title="No finished sites yet">
        A site lands here once every item lent to it has come back.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2.5">
      {sites.map((site) => (
        <li key={site.accountId}>
          <Link href={`/accounts/${site.accountId}`} className="tap block">
            <Card className="p-3.5 transition-colors hover:bg-paper">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{site.siteName}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {site.daysOut > 0 ? `held ${formatDays(site.daysOut)} · ` : ''}
                    <Money paise={site.accruedRent} /> earned
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {site.balance !== 0 && (
                    <Money paise={site.balance} className="block font-bold text-red" />
                  )}
                  <Stamp tone={site.balance === 0 ? 'green' : 'red'}>
                    {site.status === 'closed' ? 'closed' : site.balance === 0 ? 'settled' : 'due'}
                  </Stamp>
                </span>
              </div>
            </Card>
          </Link>
        </li>
      ))}

      <p className="pt-1 text-xs text-ink-3">
        {customerName} has {sites.length} finished {sites.length === 1 ? 'site' : 'sites'}. A
        balance here is money still owed on work already done.
      </p>
    </ul>
  );
}
