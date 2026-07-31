/**
 * Bills (§09).
 *
 * A bill is a frozen snapshot: its lines are written to JSONB at issue and the
 * database refuses to update or delete the row afterwards (D18). Everything a
 * later reader needs — quantities, dates, day counts, the rate each lot left
 * the yard at — is inside that snapshot, so re-pricing an item on /items can
 * never move a figure on a bill somebody has already been shown.
 *
 * Corrections are a credit adjustment and a new bill, never an edit.
 */

import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import {
  accrue,
  addDays,
  allocatePayments,
  billPaymentStatus,
  DEFAULT_BILLING_CONFIG,
  type BillPaymentStatus,
} from '../accrual';
import {
  findAccount,
  loadAdjustments,
  loadBillingConfig,
  loadMovements,
  loadPayments,
  type AccountRow,
} from '../accounts/repository';
import type { StaffSession } from '../auth/guard';
import { db, schema, withTransaction, type Database } from '../db/client';
import { ERROR_CODES, LedgerError } from '../errors';
import type { IssueBillInput } from '../validation/money';
import { buildBillDraft, defaultBillPeriod, type BillDraft, type BillScope } from './draft';

export interface BillPreview extends BillDraft {
  accountId: string;
  siteName: string;
  customerName: string;
  customerMobile: string;
  /** Everything the account owes right now, bills and unbilled alike. */
  accountBalance: number;
  /** The last period already billed, so the screen can say why it starts here. */
  lastPeriodTo: string | null;
  /**
   * Rent the ledger now attributes to periods before this one, minus what those
   * periods were actually billed.
   *
   * Non-zero means the ledger changed after a bill was issued — a back-dated
   * gate pass, or a reversal of something already charged. Neither can be fixed
   * by editing the old bill (§02 forbids it) or by this one (its period starts
   * later), so the screen surfaces the figure and the admin raises a charge or
   * credit adjustment for it.
   */
  earlierPeriodGap: number;
}

export interface BillSummary {
  id: string;
  invoiceNo: string;
  periodFrom: string;
  periodTo: string;
  rentTotal: number;
  damageTotal: number;
  chargesTotal: number;
  creditsTotal: number;
  grandTotal: number;
  dueOn: string | null;
  issuedAt: string;
  /** Paise settled against this bill by the oldest-first allocation. */
  allocated: number;
  /** Paise still owed on it. */
  outstanding: number;
  status: BillPaymentStatus;
}

export interface BillDetail extends BillSummary {
  account: AccountRow;
  customer: { id: string; name: string; mobile: string };
  /** The §09 bill header. Address and phone live in `settings`. */
  org: { name: string; address: string | null; phone: string | null; termsText: string | null };
  /** The frozen §09 line items, exactly as written at issue. */
  frozen: FrozenBill;
  payments: Array<{ id: string; amount: number; paidOn: string; method: string; reference: string | null }>;
}

/** What goes into `bills.lines`. Read back verbatim; never recomputed. */
export interface FrozenBill {
  lines: BillDraft['lines'];
  damageLines: BillDraft['damageLines'];
  adjustments: BillDraft['adjustments'];
  billedEarlier: number;
  /** Rent accrued account-to-date at issue. See `BillDraft.accruedToDate`. */
  accruedToDate: number;
  /** Days charged so far on each lot's still-open units. See the draft. */
  openDaysBilledByLot?: Record<string, number>;
  scope?: BillScope;
}

/**
 * Value a period without writing anything (§09 "preview screen").
 *
 * Dates are optional: with none supplied this answers with the default period —
 * the day after the last bill through today.
 */
export async function previewBill(
  session: StaffSession,
  accountId: string,
  requested: { periodFrom?: string; periodTo?: string; scope?: BillScope },
  today: string,
): Promise<BillPreview> {
  const database = db();
  const account = await findAccount(database, session.orgId, accountId);
  if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

  const lastPeriodTo = await lastBilledPeriodEnd(database, accountId);
  const period = resolvePeriod(account, lastPeriodTo, requested, today);

  const draft = await buildDraft(database, session.orgId, account, period, requested.scope);

  const [customer, payments, adjustments, movements, config, accruedWhenLastBilled] =
    await Promise.all([
      loadCustomer(database, account.customerId),
      loadPayments(database, accountId),
      loadAdjustments(database, accountId),
      loadMovements(database, accountId),
      loadBillingConfig(database, session.orgId),
      accruedAtLastBill(database, accountId, period.periodFrom),
    ]);

  const accrual = accrue(movements, config, today);
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const charges = adjustments
    .filter((a) => a.kind === 'charge')
    .reduce((sum, a) => sum + a.amount, 0);
  const credits = adjustments
    .filter((a) => a.kind === 'credit')
    .reduce((sum, a) => sum + a.amount, 0);

  return {
    ...draft,
    accountId,
    siteName: account.siteName,
    customerName: customer.name,
    customerMobile: customer.mobile,
    accountBalance: accrual.rentTotal + accrual.damageTotal + charges - paid - credits,
    lastPeriodTo,
    earlierPeriodGap: draft.billedEarlier - accruedWhenLastBilled,
  };
}

/**
 * Freeze a period into an invoice.
 *
 * The draft is rebuilt here from the ledger — the client sends a period and a
 * due date, never a total. Everything happens in one transaction, including the
 * invoice number, so two admins tapping Issue at the same moment cannot land on
 * the same number.
 */
export async function issueBill(
  session: StaffSession,
  input: IssueBillInput,
  today: string,
): Promise<BillSummary> {
  if (input.periodTo > today) {
    throw new LedgerError(
      ERROR_CODES.INVALID_DATE,
      'That period ends in the future. Bill up to today at the latest.',
      { field: 'periodTo' },
    );
  }

  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, input.accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

    const lastPeriodTo = await lastBilledPeriodEnd(tx, input.accountId);
    if (lastPeriodTo && input.periodFrom <= lastPeriodTo) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        `This account is billed to ${lastPeriodTo}. Start the next period the day after, or raise a credit adjustment to correct the last bill.`,
        { field: 'periodFrom', context: { lastPeriodTo } },
      );
    }

    const draft = await buildDraft(
      tx,
      session.orgId,
      account,
      { periodFrom: input.periodFrom, periodTo: input.periodTo },
      input.scope,
    );

    if (draft.grandTotal === 0 && draft.lines.length === 0 && draft.damageLines.length === 0) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'There is nothing to bill in that period — no rent accrued, no damages, no charges.',
        { field: 'periodFrom' },
      );
    }

    const { invoiceNo, paymentTermsDays } = await allocateInvoiceNumber(
      tx,
      session.orgId,
      input.periodTo,
    );

    const frozen: FrozenBill = {
      lines: draft.lines,
      damageLines: draft.damageLines,
      adjustments: draft.adjustments,
      billedEarlier: draft.billedEarlier,
      accruedToDate: draft.accruedToDate,
      openDaysBilledByLot: draft.openDaysBilledByLot,
      scope: draft.scope,
    };

    const [row] = await tx
      .insert(schema.bills)
      .values({
        orgId: session.orgId,
        accountId: input.accountId,
        invoiceNo,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        rentTotal: draft.rentTotal,
        damageTotal: draft.damageTotal,
        chargesTotal: draft.chargesTotal,
        creditsTotal: draft.creditsTotal,
        grandTotal: draft.grandTotal,
        lines: frozen,
        dueOn: input.dueOn ?? addDays(today, paymentTermsDays),
        issuedBy: session.userId,
      })
      .returning();

    // Money already on the account settles against this bill straight away.
    const allocations = await syncAllocations(tx, input.accountId);

    return toSummary(row, allocations, today);
  });
}

/** Bills on an account, newest first, each with what is still owed on it. */
export async function listBillsForAccount(
  session: StaffSession,
  accountId: string,
  asOf: string,
): Promise<BillSummary[]> {
  const database = db();

  const rows = await database
    .select()
    .from(schema.bills)
    .where(and(eq(schema.bills.orgId, session.orgId), eq(schema.bills.accountId, accountId)))
    .orderBy(desc(schema.bills.periodTo));

  const allocated = await allocatedByBill(
    database,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toSummary(row, allocated, asOf));
}

export async function getBill(
  session: StaffSession,
  billId: string,
  asOf: string,
): Promise<BillDetail> {
  const database = db();

  const [row] = await database
    .select()
    .from(schema.bills)
    .where(and(eq(schema.bills.id, billId), eq(schema.bills.orgId, session.orgId)))
    .limit(1);

  if (!row) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That bill was not found.');

  const account = await findAccount(database, session.orgId, row.accountId);
  if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That bill was not found.');

  const [customer, allocated, org, settings, allocations] = await Promise.all([
    loadCustomer(database, account.customerId),
    allocatedByBill(database, [row.id]),
    loadOrg(database, session.orgId),
    loadSettings(database, session.orgId),
    database
      .select({
        id: schema.payments.id,
        amount: schema.paymentAllocations.amount,
        paidOn: schema.payments.paidOn,
        method: schema.payments.method,
        reference: schema.payments.reference,
      })
      .from(schema.paymentAllocations)
      .innerJoin(schema.payments, eq(schema.payments.id, schema.paymentAllocations.paymentId))
      .where(eq(schema.paymentAllocations.billId, row.id))
      .orderBy(asc(schema.payments.paidOn)),
  ]);

  return {
    ...toSummary(row, allocated, asOf),
    account,
    customer,
    org: {
      name: org.name,
      address: settings?.yardAddress ?? null,
      phone: settings?.yardPhone ?? null,
      termsText: settings?.termsText ?? null,
    },
    frozen: row.lines as FrozenBill,
    payments: allocations,
  };
}

/**
 * Rent + damages already frozen into bills, per account. A listing compares
 * this against what the ledger has accrued to say "billed" or "not billed".
 */
export async function billedRentByAccount(
  session: StaffSession,
  accountIds: readonly string[],
): Promise<Map<string, number>> {
  const billed = new Map<string, number>(accountIds.map((id) => [id, 0]));
  if (accountIds.length === 0) return billed;

  const rows = await db()
    .select({
      accountId: schema.bills.accountId,
      total: sql<number>`coalesce(sum(${schema.bills.rentTotal} + ${schema.bills.damageTotal}), 0)::int`,
    })
    .from(schema.bills)
    .where(
      and(eq(schema.bills.orgId, session.orgId), inArray(schema.bills.accountId, [...accountIds])),
    )
    .groupBy(schema.bills.accountId);

  for (const row of rows) billed.set(row.accountId, row.total);
  return billed;
}

/**
 * Re-derive every allocation on an account, oldest bill first (§03.4).
 *
 * Allocations are derived data, so they are rebuilt wholesale rather than
 * patched: a new bill, a new payment, or a back-dated payment all change who
 * settles what, and a full rebuild cannot drift from `allocatePayments`.
 * Cheap — an account has tens of rows, not thousands.
 */
export async function syncAllocations(
  tx: Database,
  accountId: string,
): Promise<Record<string, number>> {
  const [bills, payments] = await Promise.all([
    tx
      .select({
        id: schema.bills.id,
        grandTotal: schema.bills.grandTotal,
        periodTo: schema.bills.periodTo,
      })
      .from(schema.bills)
      .where(eq(schema.bills.accountId, accountId)),
    tx
      .select({
        id: schema.payments.id,
        amount: schema.payments.amount,
        paidOn: schema.payments.paidOn,
      })
      .from(schema.payments)
      .where(eq(schema.payments.accountId, accountId)),
  ]);

  const paymentIds = payments.map((payment) => payment.id);
  if (paymentIds.length > 0) {
    await tx
      .delete(schema.paymentAllocations)
      .where(inArray(schema.paymentAllocations.paymentId, paymentIds));
  }

  if (bills.length === 0 || payments.length === 0) return {};

  const result = allocatePayments(
    payments,
    bills.map((bill) => ({
      id: bill.id,
      grandTotal: bill.grandTotal,
      // Age a bill by the period it closed, not by when someone got round to
      // issuing it — a June bill raised late is still older than July's.
      issuedOn: bill.periodTo,
    })),
  );

  if (result.allocations.length > 0) {
    await tx.insert(schema.paymentAllocations).values(result.allocations);
  }

  const allocated: Record<string, number> = {};
  for (const bill of bills) {
    allocated[bill.id] = bill.grandTotal - (result.outstandingByBill[bill.id] ?? 0);
  }

  return allocated;
}

/**
 * Bills past their due date with money still owed — the §09 reminder queue.
 *
 * Nothing is sent automatically: this builds the list, and an admin taps
 * through it one WhatsApp at a time.
 */
export async function listOverdueBills(
  session: StaffSession,
  asOf: string,
): Promise<Array<BillSummary & { customerName: string; customerMobile: string; siteName: string; accountId: string }>> {
  const database = db();

  const rows = await database
    .select({
      bill: schema.bills,
      siteName: schema.accounts.siteName,
      customerName: schema.customers.name,
      customerMobile: schema.customers.mobile,
    })
    .from(schema.bills)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.bills.accountId))
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .where(eq(schema.bills.orgId, session.orgId))
    .orderBy(asc(schema.bills.dueOn));

  const allocated = await allocatedByBill(
    database,
    rows.map((row) => row.bill.id),
  );

  return rows
    .map((row) => ({
      ...toSummary(row.bill, allocated, asOf),
      accountId: row.bill.accountId,
      siteName: row.siteName,
      customerName: row.customerName,
      customerMobile: row.customerMobile,
    }))
    .filter((bill) => bill.status === 'overdue');
}

// ------------------------------------------------------------- internals --

type BillRow = typeof schema.bills.$inferSelect;

function toSummary(
  row: BillRow,
  allocatedByBillId: Record<string, number>,
  asOf: string,
): BillSummary {
  const allocated = allocatedByBillId[row.id] ?? 0;

  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    rentTotal: row.rentTotal,
    damageTotal: row.damageTotal,
    chargesTotal: row.chargesTotal,
    creditsTotal: row.creditsTotal,
    grandTotal: row.grandTotal,
    dueOn: row.dueOn,
    issuedAt: row.issuedAt.toISOString(),
    allocated,
    outstanding: row.grandTotal - allocated,
    status: billPaymentStatus({
      allocated,
      grandTotal: row.grandTotal,
      dueOn: row.dueOn,
      asOf,
    }),
  };
}

async function allocatedByBill(
  database: Database,
  billIds: readonly string[],
): Promise<Record<string, number>> {
  if (billIds.length === 0) return {};

  const rows = await database
    .select({
      billId: schema.paymentAllocations.billId,
      amount: schema.paymentAllocations.amount,
    })
    .from(schema.paymentAllocations)
    .where(inArray(schema.paymentAllocations.billId, [...billIds]));

  const totals: Record<string, number> = {};
  for (const row of rows) totals[row.billId] = (totals[row.billId] ?? 0) + row.amount;
  return totals;
}

/** The frozen payload of the last bill before `periodFrom`. */
async function lastFrozenBill(
  tx: Database,
  accountId: string,
  periodFrom: string,
): Promise<FrozenBill | null> {
  const [row] = await tx
    .select({ lines: schema.bills.lines })
    .from(schema.bills)
    .where(and(eq(schema.bills.accountId, accountId), lt(schema.bills.periodTo, periodFrom)))
    .orderBy(desc(schema.bills.periodTo))
    .limit(1);

  return (row?.lines as FrozenBill | undefined) ?? null;
}

/**
 * What the last bill before `periodFrom` believed had accrued account-to-date.
 *
 * Compared against a fresh replay of the same span, this is what catches a
 * movement recorded — or reversed — behind an issued bill. Zero when there is
 * no earlier bill: a first bill charges everything, so nothing can be missed.
 */
async function accruedAtLastBill(
  database: Database,
  accountId: string,
  periodFrom: string,
): Promise<number> {
  const [row] = await database
    .select({ lines: schema.bills.lines, periodTo: schema.bills.periodTo })
    .from(schema.bills)
    .where(and(eq(schema.bills.accountId, accountId), lt(schema.bills.periodTo, periodFrom)))
    .orderBy(desc(schema.bills.periodTo))
    .limit(1);

  return (row?.lines as FrozenBill | undefined)?.accruedToDate ?? 0;
}

/** The end of the latest period already billed, or null when none is. */
async function lastBilledPeriodEnd(tx: Database, accountId: string): Promise<string | null> {
  const [row] = await tx
    .select({ periodTo: schema.bills.periodTo })
    .from(schema.bills)
    .where(eq(schema.bills.accountId, accountId))
    .orderBy(desc(schema.bills.periodTo))
    .limit(1);

  return row?.periodTo ?? null;
}

function resolvePeriod(
  account: AccountRow,
  lastPeriodTo: string | null,
  requested: { periodFrom?: string; periodTo?: string },
  today: string,
): { periodFrom: string; periodTo: string } {
  const fallback = defaultBillPeriod({
    openedOn: account.openedOn,
    lastPeriodTo,
    today,
  });

  return {
    periodFrom: requested.periodFrom ?? fallback.periodFrom,
    periodTo: requested.periodTo ?? fallback.periodTo,
  };
}

/** Both accruals, the item names, and the period's adjustments, as one draft. */
async function buildDraft(
  tx: Database,
  orgId: string,
  account: AccountRow,
  period: { periodFrom: string; periodTo: string },
  scope: BillScope = 'all',
): Promise<BillDraft> {
  const [config, movements, adjustments] = await Promise.all([
    loadBillingConfig(tx, orgId),
    loadMovements(tx, account.id),
    loadAdjustments(tx, account.id),
  ]);

  // What the previous bill recorded charging on lots still out — the record
  // that keeps a `returned`-scoped bill from forgiving rent it skipped.
  const lastFrozen = await lastFrozenBill(tx, account.id, period.periodFrom);

  const itemIds = [...new Set(movements.map((movement) => movement.itemId))];
  const itemNames = await loadItemNames(tx, itemIds);

  // A period starting on the day the account opened has no history behind it,
  // so there is nothing to subtract — that is what makes it a first bill.
  const priorTo = addDays(period.periodFrom, -1);
  const isFirst = priorTo < account.openedOn;

  return buildBillDraft({
    current: accrue(movements, config, period.periodTo),
    prior: isFirst ? null : accrue(movements, config, priorTo),
    adjustments,
    itemNames,
    periodFrom: period.periodFrom,
    periodTo: period.periodTo,
    config,
    scope,
    previousOpenDays: lastFrozen?.openDaysBilledByLot,
  });
}

/**
 * Take the next invoice number, inside the caller's transaction (§09).
 *
 * `update … returning` is atomic, so concurrent issues get different numbers.
 * The settings row is created on demand: a yard that has never opened the
 * settings screen still has to be able to raise its first bill.
 */
async function allocateInvoiceNumber(
  tx: Database,
  orgId: string,
  periodTo: string,
): Promise<{ invoiceNo: string; paymentTermsDays: number }> {
  await tx
    .insert(schema.settings)
    .values({ orgId, billing: DEFAULT_BILLING_CONFIG })
    .onConflictDoNothing();

  const [row] = await tx
    .update(schema.settings)
    .set({ nextInvoiceNo: sql`${schema.settings.nextInvoiceNo} + 1` })
    .where(eq(schema.settings.orgId, orgId))
    .returning({
      nextInvoiceNo: schema.settings.nextInvoiceNo,
      prefix: schema.settings.invoicePrefix,
      paymentTermsDays: schema.settings.paymentTermsDays,
    });

  // `returning` gives the incremented value, so the number just taken is one
  // less. Formatted INV-2026-0042, per §09.
  const taken = row.nextInvoiceNo - 1;

  return {
    invoiceNo: `${row.prefix}-${periodTo.slice(0, 4)}-${String(taken).padStart(4, '0')}`,
    paymentTermsDays: row.paymentTermsDays,
  };
}

async function loadItemNames(
  tx: Database,
  itemIds: readonly string[],
): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};

  const rows = await tx
    .select({ id: schema.items.id, name: schema.items.name })
    .from(schema.items)
    .where(inArray(schema.items.id, [...itemIds]));

  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

async function loadCustomer(database: Database, customerId: string) {
  const [row] = await database
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      mobile: schema.customers.mobile,
    })
    .from(schema.customers)
    .where(eq(schema.customers.id, customerId))
    .limit(1);

  return row;
}

async function loadOrg(database: Database, orgId: string) {
  const [row] = await database
    .select({ name: schema.orgs.name })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, orgId))
    .limit(1);

  return row;
}

async function loadSettings(database: Database, orgId: string) {
  const [row] = await database
    .select({
      termsText: schema.settings.termsText,
      yardAddress: schema.settings.yardAddress,
      yardPhone: schema.settings.yardPhone,
    })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, orgId))
    .limit(1);

  return row ?? null;
}
