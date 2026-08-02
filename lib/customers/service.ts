/**
 * The customer register (§01).
 *
 * A customer is identified by mobile number and may hold several accounts —
 * usually one per construction site.
 */

import { and, asc, eq, ilike, or, sql } from 'drizzle-orm';

import { listAccounts, rollupByCustomer } from '../accounts/service';
import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import { LedgerError, ERROR_CODES } from '../errors';
import type { CreateCustomerInput, UpdateCustomerInput } from '../validation/customers';

export interface CustomerSummary {
  id: string;
  name: string;
  mobile: string;
  isBlocked: boolean;
  creditLimit: number;
  openAccounts: number;
  /** Paise owed across every site (§08.1 "list with outstanding"). */
  balance: number;
  qtyOut: number;
  /** Owes more than their agreed limit. A zero limit means no limit. */
  overCreditLimit: boolean;
}

/**
 * Search by name or mobile. Both are what an admin has to hand in the yard.
 *
 * `asOf` values the outstanding column — rent is still accruing while the
 * equipment is out, so a balance without a date means nothing.
 */
export async function searchCustomers(
  session: StaffSession,
  query: string | undefined,
  limit: number,
  asOf: string,
): Promise<CustomerSummary[]> {
  const database = db();
  const term = query?.trim();

  const filters = [eq(schema.customers.orgId, session.orgId)];

  if (term) {
    // Match the mobile on digits alone, so "9846" finds "+919846012345".
    const digits = term.replace(/\D/g, '');
    const matches = [ilike(schema.customers.name, `%${term}%`)];
    if (digits.length >= 3) matches.push(ilike(schema.customers.mobile, `%${digits}%`));
    filters.push(or(...matches)!);
  }

  /*
   * With a search term, alphabetical is right — the admin knows the name and
   * is narrowing. With no term this is the picker's opening list, and the
   * useful order is who the yard dealt with most recently: the contractor who
   * took a load this morning is the one being lent to again this afternoon.
   */
  const lastActivity = sql<string>`(
    select max(m.created_at) from ${schema.movements} m
    join ${schema.accounts} a on a.id = m.account_id
    where a.customer_id = ${schema.customers.id}
  )`;

  const customers = await database
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      mobile: schema.customers.mobile,
      isBlocked: schema.customers.isBlocked,
      creditLimit: schema.customers.creditLimit,
    })
    .from(schema.customers)
    .where(and(...filters))
    .orderBy(term ? asc(schema.customers.name) : sql`${lastActivity} desc nulls last`)
    .limit(limit);

  const rollups = await rollupByCustomer(
    session,
    customers.map((customer) => customer.id),
    asOf,
  );

  return customers.map((customer) => {
    const rollup = rollups.get(customer.id)!;
    return {
      ...customer,
      ...rollup,
      overCreditLimit: customer.creditLimit > 0 && rollup.balance > customer.creditLimit,
    };
  });
}

export async function createCustomer(session: StaffSession, input: CreateCustomerInput) {
  const database = db();

  const [existing] = await database
    .select({ id: schema.customers.id, name: schema.customers.name })
    .from(schema.customers)
    .where(
      and(eq(schema.customers.orgId, session.orgId), eq(schema.customers.mobile, input.mobile)),
    )
    .limit(1);

  if (existing) {
    // §07.4 merges on (org_id, mobile) during sync. Online, say so plainly
    // rather than creating a second khata for the same contractor.
    throw new LedgerError(
      ERROR_CODES.CONFLICT,
      `${existing.name} is already registered with that number.`,
      { field: 'mobile', context: { customerId: existing.id } },
    );
  }

  const [row] = await database
    .insert(schema.customers)
    .values({
      orgId: session.orgId,
      name: input.name,
      mobile: input.mobile,
      altMobile: input.altMobile ?? null,
      address: input.address ?? null,
      idProofUrl: input.idProofUrl ?? null,
      creditLimit: input.creditLimit,
      notes: input.notes ?? null,
    })
    .returning();

  return row;
}

export async function updateCustomer(
  session: StaffSession,
  customerId: string,
  input: UpdateCustomerInput,
) {
  const database = db();

  const [row] = await database
    .update(schema.customers)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.mobile === undefined ? {} : { mobile: input.mobile }),
      ...(input.altMobile === undefined ? {} : { altMobile: input.altMobile }),
      ...(input.address === undefined ? {} : { address: input.address }),
      ...(input.creditLimit === undefined ? {} : { creditLimit: input.creditLimit }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.isBlocked === undefined ? {} : { isBlocked: input.isBlocked }),
    })
    .where(
      and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, session.orgId)),
    )
    .returning();

  if (!row) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That customer was not found.');
  return row;
}

/** Profile, accounts, and total outstanding across every site (§06). */
export async function getCustomerDetail(
  session: StaffSession,
  customerId: string,
  asOf: string,
) {
  const database = db();

  const [customer] = await database
    .select()
    .from(schema.customers)
    .where(
      and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, session.orgId)),
    )
    .limit(1);

  if (!customer) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That customer was not found.');

  // Every site, open and closed, each valued by replaying its ledger.
  const accounts = await listAccounts(session, { customerId, status: 'all' }, asOf);

  return {
    customer,
    accounts,
    totalOutstanding: accounts.reduce((sum, account) => sum + account.balance, 0),
  };
}
