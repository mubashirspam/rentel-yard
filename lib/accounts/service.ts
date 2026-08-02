/**
 * Accounts — the running khata, one per customer per site (§02).
 *
 * Everything derived here comes from replaying the ledger. Nothing is stored
 * as a mutable balance or count (§00 rule 2).
 */

import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';

import {
  accrue,
  addDays,
  computeBalance,
  differenceInCalendarDays,
  isAccountEmpty,
  type AccountBalance,
  type AccrualResult,
  type BillingConfig,
} from '../accrual';
import type { StaffSession } from '../auth/guard';
import { db, schema, withTransaction, type Database } from '../db/client';
import { LedgerError, ERROR_CODES } from '../errors';
import type { CloseAccountInput, OpenAccountInput } from '../validation/accounts';
import {
  findAccount,
  loadAdjustments,
  loadBillingConfig,
  loadLedgers,
  loadMovements,
  loadPayments,
  type AccountRow,
} from './repository';

export interface OutstandingLine {
  itemId: string;
  itemName: string;
  itemCode: string | null;
  unit: string;
  qtyOut: number;
  /** Oldest still-open lot for this item. */
  since: string;
  daysHeld: number;
  /** Paise per day for everything of this item still out. */
  accruingPerDay: number;
  /** Paise accrued so far. */
  accruedSoFar: number;
}

export interface MonthSummary {
  /** First day of the month being summarised. */
  from: string;
  /** Paise of rent accrued in this calendar month. */
  rentAccrued: number;
  /** Paise of damage charged in this calendar month. */
  damages: number;
  /** Paise received in this calendar month. */
  received: number;
}

export interface AccountDetail {
  account: AccountRow;
  customer: { id: string; name: string; mobile: string };
  asOf: string;
  /** The rules these figures were produced under (§03.1) — the screen says so. */
  config: BillingConfig;
  accrual: AccrualResult;
  balance: AccountBalance;
  outstanding: OutstandingLine[];
  payments: Awaited<ReturnType<typeof loadPayments>>;
  adjustments: Awaited<ReturnType<typeof loadAdjustments>>;
  ledger: LedgerEntry[];
  canClose: boolean;
  /** What the current calendar month has added so far. */
  thisMonth: MonthSummary;
}

export type LedgerEntry =
  | {
      kind: 'movement';
      id: string;
      at: string;
      movedAt: string;
      type: string;
      itemName: string;
      qty: number;
      by: string | null;
      gatePassNo: string | null;
      remarks: string | null;
      reversesId: string | null;
      reversedBy: string | null;
    }
  | {
      kind: 'payment';
      id: string;
      at: string;
      movedAt: string;
      amount: number;
      method: string;
      reference: string | null;
      by: string | null;
    }
  | {
      kind: 'adjustment';
      id: string;
      at: string;
      movedAt: string;
      adjustmentKind: 'charge' | 'credit';
      amount: number;
      reason: string;
      by: string | null;
    };

/**
 * Open a khata. A customer may hold several — usually one per site.
 *
 * `clientUuid` is supplied by the offline sync push (§07.2) so that a queued
 * "open site" pushed twice cannot become two khatas for one contractor. Online
 * callers omit it.
 */
export async function openAccount(
  session: StaffSession,
  input: OpenAccountInput,
  clientUuid?: string,
): Promise<AccountRow> {
  const database = db();

  const [customer] = await database
    .select({ id: schema.customers.id, isBlocked: schema.customers.isBlocked })
    .from(schema.customers)
    .where(
      and(eq(schema.customers.id, input.customerId), eq(schema.customers.orgId, session.orgId)),
    )
    .limit(1);

  if (!customer) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That customer was not found.');

  if (customer.isBlocked) {
    throw new LedgerError(
      ERROR_CODES.CONFLICT,
      'This customer is blocked. Unblock them before opening a new site.',
      { field: 'customerId' },
    );
  }

  const [row] = await database
    .insert(schema.accounts)
    .values({
      orgId: session.orgId,
      customerId: input.customerId,
      siteName: input.siteName,
      siteAddress: input.siteAddress ?? null,
      openedOn: input.openedOn,
      clientUuid: clientUuid ?? null,
      createdBy: session.userId,
    })
    .returning({
      id: schema.accounts.id,
      orgId: schema.accounts.orgId,
      customerId: schema.accounts.customerId,
      siteName: schema.accounts.siteName,
      siteAddress: schema.accounts.siteAddress,
      status: schema.accounts.status,
      openedOn: schema.accounts.openedOn,
      closedOn: schema.accounts.closedOn,
    });

  return row;
}

/**
 * The customer's general khata — the account a lending lands on when no site
 * is named.
 *
 * The owner's ruling: a transaction belongs to the *person*; a site is a
 * refinement they may or may not care to make. The schema still wants an
 * account under every movement (rightly — it is what a bill is drawn against),
 * so "no site" means this one, created on first use.
 *
 * Get-or-create is made idempotent by the `(org_id, client_uuid)` unique index
 * with a deterministic key per customer — two phones tapping "skip" at the
 * same moment converge on one khata instead of racing two into existence. A
 * closed General khata is quietly reopened: the customer came back.
 */
export async function defaultAccount(
  session: StaffSession,
  customerId: string,
  today: string,
): Promise<AccountRow> {
  const database = db();
  const key = `general-${customerId}`;

  await database
    .insert(schema.accounts)
    .values({
      orgId: session.orgId,
      customerId,
      siteName: 'General',
      openedOn: today,
      clientUuid: key,
      createdBy: session.userId,
    })
    .onConflictDoNothing();

  const [row] = await database
    .select({
      id: schema.accounts.id,
      orgId: schema.accounts.orgId,
      customerId: schema.accounts.customerId,
      siteName: schema.accounts.siteName,
      siteAddress: schema.accounts.siteAddress,
      status: schema.accounts.status,
      openedOn: schema.accounts.openedOn,
      closedOn: schema.accounts.closedOn,
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.orgId, session.orgId), eq(schema.accounts.clientUuid, key)))
    .limit(1);

  if (row.status === 'closed') {
    const [reopened] = await database
      .update(schema.accounts)
      .set({ status: 'open', closedOn: null })
      .where(eq(schema.accounts.id, row.id))
      .returning({
        id: schema.accounts.id,
        orgId: schema.accounts.orgId,
        customerId: schema.accounts.customerId,
        siteName: schema.accounts.siteName,
        siteAddress: schema.accounts.siteAddress,
        status: schema.accounts.status,
        openedOn: schema.accounts.openedOn,
        closedOn: schema.accounts.closedOn,
      });
    return reopened;
  }

  return row;
}

/**
 * Everything the account screen needs, in one replay (§08.2).
 *
 * `asOf` defaults to today. Rent keeps accruing past a bill until the items
 * physically return, unless the org sets `accrual_stops_on_bill`.
 */
export async function getAccountDetail(
  session: StaffSession,
  accountId: string,
  asOf: string,
): Promise<AccountDetail> {
  const database = db();

  const account = await findAccount(database, session.orgId, accountId);
  if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

  const [config, movements, payments, adjustments, customer, items] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadMovements(database, accountId),
    loadPayments(database, accountId),
    loadAdjustments(database, accountId),
    loadCustomer(database, account.customerId),
    loadItemsForAccount(database, accountId),
  ]);

  const accrual = accrue(movements, config, asOf);
  const balance = computeBalance({ accrual, adjustments, payments });

  // This month's figures are a second replay valued at the day before the
  // month began — the month is whatever accrued in between.
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const beforeMonth = accrue(movements, config, addDays(monthStart, -1));

  return {
    account,
    customer,
    asOf,
    config,
    accrual,
    balance,
    outstanding: buildOutstanding(accrual, items, asOf),
    payments,
    adjustments,
    ledger: await buildLedger(database, accountId, payments, adjustments),
    canClose: isAccountEmpty(accrual),
    thisMonth: {
      from: monthStart,
      rentAccrued: accrual.rentTotal - beforeMonth.rentTotal,
      damages: accrual.damageTotal - beforeMonth.damageTotal,
      received: payments
        .filter((payment) => payment.paidOn >= monthStart && payment.paidOn <= asOf)
        .reduce((sum, payment) => sum + payment.amount, 0),
    },
  };
}

/**
 * Close an account.
 *
 * §02: an account cannot be closed while any item has outstanding qty above
 * zero. Runs inside a transaction so a return landing at the same moment
 * cannot slip in after the check.
 */
export async function closeAccount(
  session: StaffSession,
  accountId: string,
  input: CloseAccountInput,
): Promise<AccountRow> {
  return withTransaction(async (tx) => {
    const account = await findAccount(tx, session.orgId, accountId);
    if (!account) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That account was not found.');

    if (account.status === 'closed') {
      throw new LedgerError(ERROR_CODES.CONFLICT, 'That account is already closed.');
    }

    const config = await loadBillingConfig(tx, session.orgId);
    const movements = await loadMovements(tx, accountId);
    const accrual = accrue(movements, config, input.closedOn);

    if (!isAccountEmpty(accrual)) {
      const stillOut = Object.entries(accrual.outstanding)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ itemId, qty }));

      throw new LedgerError(
        ERROR_CODES.ACCOUNT_NOT_EMPTY,
        'Equipment is still out on this account. Record the returns first.',
        { context: { outstanding: stillOut } },
      );
    }

    const [row] = await tx
      .update(schema.accounts)
      .set({ status: 'closed', closedOn: input.closedOn })
      .where(eq(schema.accounts.id, accountId))
      .returning({
        id: schema.accounts.id,
        orgId: schema.accounts.orgId,
        customerId: schema.accounts.customerId,
        siteName: schema.accounts.siteName,
        siteAddress: schema.accounts.siteAddress,
        status: schema.accounts.status,
        openedOn: schema.accounts.openedOn,
        closedOn: schema.accounts.closedOn,
      });

    return row;
  });
}

export interface AccountListRow extends AccountRow {
  customerName: string;
  customerMobile: string;
  /** Paise. Positive means the customer owes the yard. */
  balance: number;
  /** Units still out across every item on the account. */
  qtyOut: number;
  daysOpen: number;
  /** Paise of rent + damages accrued to date — compare with bills to spot the unbilled. */
  accruedRent: number;
  /** Paise per day everything still out is accruing at. */
  perDay: number;
  /**
   * Open, but everything has come back and nothing is accruing.
   *
   * The owner's rule: a site that has been emptied is *completed*, not closed.
   * It keeps its account so the next lorry to the same site needs no new khata,
   * and closing stays a deliberate act (§02).
   */
  isCompleted: boolean;
}

/** Sort key for the working list: still out → completed → closed. */
function rank(account: { status: 'open' | 'closed'; isCompleted: boolean }): number {
  if (account.status === 'closed') return 2;
  return account.isCompleted ? 1 : 0;
}

export interface AccountListFilters {
  /** Defaults to `open` — the working list is the open one. */
  status?: 'open' | 'closed' | 'all';
  /** Matches the customer's name or the site name. */
  q?: string;
  customerId?: string;
  limit?: number;
}

/**
 * Accounts with what each currently owes and holds.
 *
 * Every figure is a replay (§00 rule 2), but the ledgers load in bulk — one
 * query per table for the whole page, not per account.
 */
export async function listAccounts(
  session: StaffSession,
  filters: AccountListFilters,
  asOf: string,
): Promise<AccountListRow[]> {
  const database = db();
  const { status = 'open', q, customerId, limit = 100 } = filters;

  const conditions = [eq(schema.accounts.orgId, session.orgId)];
  if (status !== 'all') conditions.push(eq(schema.accounts.status, status));
  if (customerId) conditions.push(eq(schema.accounts.customerId, customerId));

  const term = q?.trim();
  if (term) {
    conditions.push(
      or(ilike(schema.customers.name, `%${term}%`), ilike(schema.accounts.siteName, `%${term}%`))!,
    );
  }

  const accounts = await database
    .select({
      id: schema.accounts.id,
      orgId: schema.accounts.orgId,
      customerId: schema.accounts.customerId,
      siteName: schema.accounts.siteName,
      siteAddress: schema.accounts.siteAddress,
      status: schema.accounts.status,
      openedOn: schema.accounts.openedOn,
      closedOn: schema.accounts.closedOn,
      customerName: schema.customers.name,
      customerMobile: schema.customers.mobile,
    })
    .from(schema.accounts)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
    .where(and(...conditions))
    .orderBy(desc(schema.accounts.openedOn))
    .limit(limit);

  const [config, ledgers] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadLedgers(
      database,
      accounts.map((account) => account.id),
    ),
  ]);

  return accounts
    .map((account) => {
      const ledger = ledgers.get(account.id)!;
      const accrual = accrue(ledger.movements, config, asOf);
      const balance = computeBalance({ accrual, ...ledger });

      const qtyOut = Object.values(accrual.outstanding).reduce((sum, qty) => sum + qty, 0);

      return {
        ...account,
        isCompleted: account.status === 'open' && qtyOut === 0,
        balance: balance.balance,
        qtyOut,
        daysOpen: differenceInCalendarDays(account.closedOn ?? asOf, account.openedOn) + 1,
        accruedRent: accrual.rentTotal + accrual.damageTotal,
        perDay: accrual.openLots.reduce((sum, lot) => sum + lot.qty * lot.ratePerDay, 0),
      };
    })
    /*
     * Working order: sites with equipment out first, then completed ones, then
     * closed. Within each, whoever owes most. An admin's day is spent on what
     * is still out — a completed site only matters when the money is chased.
     */
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        b.balance - a.balance ||
        a.customerName.localeCompare(b.customerName),
    );
}

export interface CustomerRollup {
  /** Paise owed across every site, open and closed. */
  balance: number;
  qtyOut: number;
  openAccounts: number;
}

/**
 * What each of these customers owes and holds, across all their sites.
 *
 * Closed accounts are included: closing a site means the equipment came back,
 * not that the bill was paid.
 */
export async function rollupByCustomer(
  session: StaffSession,
  customerIds: readonly string[],
  asOf: string,
): Promise<Map<string, CustomerRollup>> {
  const rollups = new Map<string, CustomerRollup>(
    customerIds.map((id) => [id, { balance: 0, qtyOut: 0, openAccounts: 0 }]),
  );

  if (customerIds.length === 0) return rollups;
  const database = db();

  const accounts = await database
    .select({
      id: schema.accounts.id,
      customerId: schema.accounts.customerId,
      status: schema.accounts.status,
    })
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.orgId, session.orgId),
        inArray(schema.accounts.customerId, [...customerIds]),
      ),
    );

  const [config, ledgers] = await Promise.all([
    loadBillingConfig(database, session.orgId),
    loadLedgers(
      database,
      accounts.map((account) => account.id),
    ),
  ]);

  for (const account of accounts) {
    const rollup = rollups.get(account.customerId);
    if (!rollup) continue;

    const ledger = ledgers.get(account.id)!;
    const accrual = accrue(ledger.movements, config, asOf);

    rollup.balance += computeBalance({ accrual, ...ledger }).balance;
    rollup.qtyOut += Object.values(accrual.outstanding).reduce((sum, qty) => sum + qty, 0);
    if (account.status === 'open') rollup.openAccounts += 1;
  }

  return rollups;
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

async function loadItemsForAccount(database: Database, accountId: string) {
  const rows = await database
    .selectDistinct({
      id: schema.items.id,
      name: schema.items.name,
      code: schema.items.code,
      unit: schema.items.unit,
    })
    .from(schema.items)
    .innerJoin(schema.movements, eq(schema.movements.itemId, schema.items.id))
    .where(eq(schema.movements.accountId, accountId));

  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * "Currently out" for the account screen: one row per item, oldest lot first,
 * with what it is costing the customer per day.
 */
function buildOutstanding(
  accrual: AccrualResult,
  items: Map<string, { id: string; name: string; code: string | null; unit: string }>,
  asOf: string,
): OutstandingLine[] {
  const byItem = new Map<string, OutstandingLine>();

  for (const lot of accrual.openLots) {
    const item = items.get(lot.itemId);
    const existing = byItem.get(lot.itemId);

    if (existing) {
      existing.qtyOut += lot.qty;
      existing.accruingPerDay += lot.qty * lot.ratePerDay;
      existing.accruedSoFar += lot.accruedAmount;
      // Keep the oldest lot's date — that is what the customer is asked about.
      if (lot.from < existing.since) {
        existing.since = lot.from;
        existing.daysHeld = lot.daysHeld;
      }
      continue;
    }

    byItem.set(lot.itemId, {
      itemId: lot.itemId,
      itemName: item?.name ?? 'Unknown item',
      itemCode: item?.code ?? null,
      unit: item?.unit ?? 'nos',
      qtyOut: lot.qty,
      since: lot.from,
      daysHeld: lot.daysHeld,
      accruingPerDay: lot.qty * lot.ratePerDay,
      accruedSoFar: lot.accruedAmount,
    });
  }

  void asOf;
  return [...byItem.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/**
 * Movements, payments, and adjustments interleaved, newest first (§08.2).
 * Each row carries who entered it — the ledger is the audit log (§02).
 */
async function buildLedger(
  database: Database,
  accountId: string,
  payments: Awaited<ReturnType<typeof loadPayments>>,
  adjustments: Awaited<ReturnType<typeof loadAdjustments>>,
): Promise<LedgerEntry[]> {
  const movementRows = await database
    .select({
      id: schema.movements.id,
      type: schema.movements.type,
      qty: schema.movements.qty,
      movedAt: schema.movements.movedAt,
      createdAt: schema.movements.createdAt,
      gatePassNo: schema.movements.gatePassNo,
      remarks: schema.movements.remarks,
      reversesId: schema.movements.reversesId,
      itemName: schema.items.name,
      by: schema.users.name,
    })
    .from(schema.movements)
    .innerJoin(schema.items, eq(schema.items.id, schema.movements.itemId))
    .leftJoin(schema.users, eq(schema.users.id, schema.movements.createdBy))
    .where(eq(schema.movements.accountId, accountId))
    .orderBy(asc(schema.movements.movedAt));

  const reversedBy = new Map<string, string>();
  for (const row of movementRows) {
    if (row.reversesId) reversedBy.set(row.reversesId, row.id);
  }

  const entries: LedgerEntry[] = [
    ...movementRows.map(
      (row): LedgerEntry => ({
        kind: 'movement',
        id: row.id,
        at: row.createdAt.toISOString(),
        movedAt: row.movedAt,
        type: row.type,
        itemName: row.itemName,
        qty: row.qty,
        by: row.by,
        gatePassNo: row.gatePassNo,
        remarks: row.remarks,
        reversesId: row.reversesId,
        reversedBy: reversedBy.get(row.id) ?? null,
      }),
    ),
    ...payments.map(
      (row): LedgerEntry => ({
        kind: 'payment',
        id: row.id,
        at: row.paidOn,
        movedAt: row.paidOn,
        amount: row.amount,
        method: row.method,
        reference: row.reference,
        by: null,
      }),
    ),
    ...adjustments.map(
      (row): LedgerEntry => ({
        kind: 'adjustment',
        id: row.id,
        at: row.appliedOn,
        movedAt: row.appliedOn,
        adjustmentKind: row.kind,
        amount: row.amount,
        reason: row.reason,
        by: null,
      }),
    ),
  ];

  return entries.sort((a, b) => b.movedAt.localeCompare(a.movedAt) || b.at.localeCompare(a.at));
}
