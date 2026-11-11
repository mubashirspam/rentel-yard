/**
 * A customer statement: every bill across all their sites in one document,
 * with what was paid on each and what is still owed, plus the payments taken.
 *
 * Sent instead of one PDF per bill when a contractor has several bills due.
 * Every figure is read from the bills as issued and the server's allocation —
 * nothing here works out a balance of its own.
 */

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import { ERROR_CODES, LedgerError } from '../errors';
import { getBill, listBillsForAccounts, type BillDetail } from './service';

export type StatementScope = 'all' | 'unpaid';

export interface StatementPayment {
  id: string;
  siteName: string;
  paidOn: string;
  /** Paise received. */
  amount: number;
  /** Paise let off with it. */
  discount: number;
  method: string;
  reference: string | null;
}

export interface CustomerStatement {
  asOf: string;
  scope: StatementScope;
  customer: { id: string; name: string; mobile: string };
  org: BillDetail['org'];
  /** Oldest first, so the history reads top to bottom. */
  bills: BillDetail[];
  /** Oldest first. Empty for an unpaid-only statement. */
  payments: StatementPayment[];
  totals: { billed: number; settled: number; outstanding: number };
}

export async function getCustomerStatement(
  session: StaffSession,
  customerId: string,
  asOf: string,
  scope: StatementScope = 'all',
): Promise<CustomerStatement> {
  const database = db();

  const [customer] = await database
    .select({ id: schema.customers.id, name: schema.customers.name, mobile: schema.customers.mobile })
    .from(schema.customers)
    .where(
      and(
        eq(schema.customers.id, customerId),
        eq(schema.customers.orgId, session.orgId),
        isNull(schema.customers.deletedAt),
      ),
    )
    .limit(1);
  if (!customer) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That customer was not found.');

  const accounts = await database
    .select({ id: schema.accounts.id, siteName: schema.accounts.siteName })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.customerId, customerId), eq(schema.accounts.orgId, session.orgId)));
  const accountIds = accounts.map((a) => a.id);
  const siteName = new Map(accounts.map((a) => [a.id, a.siteName]));

  const summaries = [...(await listBillsForAccounts(session, accountIds, asOf)).values()]
    .flat()
    .filter((bill) => scope === 'all' || bill.outstanding > 0)
    .sort(
      (a, b) =>
        a.periodTo.localeCompare(b.periodTo) || a.invoiceNo.localeCompare(b.invoiceNo),
    );

  // One detail read per bill for the line items. A statement is a few dozen
  // bills at most, and the detail is the same read the bill PDF uses.
  const bills = await Promise.all(summaries.map((bill) => getBill(session, bill.id, asOf)));

  const payments =
    scope === 'all' && accountIds.length > 0
      ? (
          await database
            .select({
              id: schema.payments.id,
              accountId: schema.payments.accountId,
              paidOn: schema.payments.paidOn,
              amount: schema.payments.amount,
              discount: schema.payments.discount,
              method: schema.payments.method,
              reference: schema.payments.reference,
            })
            .from(schema.payments)
            .where(
              and(
                eq(schema.payments.orgId, session.orgId),
                inArray(schema.payments.accountId, accountIds),
              ),
            )
            .orderBy(asc(schema.payments.paidOn))
        ).map(({ accountId, ...p }) => ({ ...p, siteName: siteName.get(accountId) ?? '' }))
      : [];

  const org = bills[0]?.org ?? (await loadOrgHeader(session.orgId));

  return {
    asOf,
    scope,
    customer,
    org,
    bills,
    payments,
    totals: {
      billed: bills.reduce((sum, b) => sum + b.grandTotal, 0),
      settled: bills.reduce((sum, b) => sum + b.allocated, 0),
      outstanding: bills.reduce((sum, b) => sum + Math.max(0, b.outstanding), 0),
    },
  };
}

async function loadOrgHeader(orgId: string): Promise<BillDetail['org']> {
  const database = db();
  const [[org], [settings]] = await Promise.all([
    database.select({ name: schema.orgs.name }).from(schema.orgs).where(eq(schema.orgs.id, orgId)),
    database
      .select({
        termsText: schema.settings.termsText,
        yardAddress: schema.settings.yardAddress,
        yardPhone: schema.settings.yardPhone,
      })
      .from(schema.settings)
      .where(eq(schema.settings.orgId, orgId)),
  ]);
  return {
    name: org?.name ?? '',
    address: settings?.yardAddress ?? null,
    phone: settings?.yardPhone ?? null,
    termsText: settings?.termsText ?? null,
  };
}
