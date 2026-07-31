/**
 * Reports — the year/month analysis the counter asks for at accounts time.
 *
 * Money figures come from what was actually billed and actually received in a
 * month; units come from the movement ledger. Everything is read-only and
 * derived — a report never stores a total of its own (§00 rule 2).
 */

import { and, eq, sql } from 'drizzle-orm';

import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';

export interface MonthRow {
  /** `YYYY-MM`. */
  month: string;
  /** Paise billed in the month (grand totals of bills issued). */
  billed: number;
  billsCount: number;
  /** Paise received in the month. */
  received: number;
  paymentsCount: number;
}

export interface YearOverview {
  year: number;
  months: MonthRow[];
  billedTotal: number;
  receivedTotal: number;
}

export interface MonthDetail {
  month: string;
  billed: number;
  billsCount: number;
  rentBilled: number;
  damagesBilled: number;
  received: number;
  paymentsCount: number;
  /** Paise received per payment method — cash, upi, bank, cheque, other. */
  receivedByMethod: Array<{ method: string; amount: number }>;
  /** Units that moved in the month, by movement type. */
  units: { issued: number; returned: number; damaged: number; lost: number };
  /** Who the month's bills went to, biggest first. */
  topCustomers: Array<{ name: string; billed: number }>;
}

/** Twelve months of billed-vs-received for one year, zeros where quiet. */
export async function getYearOverview(
  session: StaffSession,
  year: number,
): Promise<YearOverview> {
  const database = db();
  const yearText = String(year);

  const [billRows, paymentRows] = await Promise.all([
    database
      .select({
        month: sql<string>`to_char(${schema.bills.issuedAt}, 'YYYY-MM')`,
        billed: sql<number>`coalesce(sum(${schema.bills.grandTotal}), 0)::int`,
        billsCount: sql<number>`count(*)::int`,
      })
      .from(schema.bills)
      .where(
        and(
          eq(schema.bills.orgId, session.orgId),
          sql`to_char(${schema.bills.issuedAt}, 'YYYY') = ${yearText}`,
        ),
      )
      .groupBy(sql`1`),
    database
      .select({
        month: sql<string>`to_char(${schema.payments.paidOn}, 'YYYY-MM')`,
        received: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::int`,
        paymentsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orgId, session.orgId),
          sql`to_char(${schema.payments.paidOn}, 'YYYY') = ${yearText}`,
        ),
      )
      .groupBy(sql`1`),
  ]);

  const billedByMonth = new Map(billRows.map((row) => [row.month, row]));
  const receivedByMonth = new Map(paymentRows.map((row) => [row.month, row]));

  const months: MonthRow[] = [];
  for (let m = 1; m <= 12; m += 1) {
    const month = `${yearText}-${String(m).padStart(2, '0')}`;
    const billed = billedByMonth.get(month);
    const received = receivedByMonth.get(month);
    months.push({
      month,
      billed: billed?.billed ?? 0,
      billsCount: billed?.billsCount ?? 0,
      received: received?.received ?? 0,
      paymentsCount: received?.paymentsCount ?? 0,
    });
  }

  return {
    year,
    months,
    billedTotal: months.reduce((sum, row) => sum + row.billed, 0),
    receivedTotal: months.reduce((sum, row) => sum + row.received, 0),
  };
}

/** One month under the magnifying glass. */
export async function getMonthDetail(
  session: StaffSession,
  month: string,
): Promise<MonthDetail> {
  const database = db();

  const [billAgg, paymentAgg, byMethod, movementRows, customerRows] = await Promise.all([
    database
      .select({
        billed: sql<number>`coalesce(sum(${schema.bills.grandTotal}), 0)::int`,
        billsCount: sql<number>`count(*)::int`,
        rentBilled: sql<number>`coalesce(sum(${schema.bills.rentTotal}), 0)::int`,
        damagesBilled: sql<number>`coalesce(sum(${schema.bills.damageTotal}), 0)::int`,
      })
      .from(schema.bills)
      .where(
        and(
          eq(schema.bills.orgId, session.orgId),
          sql`to_char(${schema.bills.issuedAt}, 'YYYY-MM') = ${month}`,
        ),
      ),
    database
      .select({
        received: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::int`,
        paymentsCount: sql<number>`count(*)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orgId, session.orgId),
          sql`to_char(${schema.payments.paidOn}, 'YYYY-MM') = ${month}`,
        ),
      ),
    database
      .select({
        method: schema.payments.method,
        amount: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::int`,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.orgId, session.orgId),
          sql`to_char(${schema.payments.paidOn}, 'YYYY-MM') = ${month}`,
        ),
      )
      .groupBy(schema.payments.method)
      .orderBy(sql`2 desc`),
    database
      .select({
        type: schema.movements.type,
        qty: sql<number>`coalesce(sum(${schema.movements.qty}), 0)::int`,
      })
      .from(schema.movements)
      .where(
        and(
          eq(schema.movements.orgId, session.orgId),
          sql`to_char(${schema.movements.movedAt}, 'YYYY-MM') = ${month}`,
        ),
      )
      .groupBy(schema.movements.type),
    database
      .select({
        name: schema.customers.name,
        billed: sql<number>`coalesce(sum(${schema.bills.grandTotal}), 0)::int`,
      })
      .from(schema.bills)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.bills.accountId))
      .innerJoin(schema.customers, eq(schema.customers.id, schema.accounts.customerId))
      .where(
        and(
          eq(schema.bills.orgId, session.orgId),
          sql`to_char(${schema.bills.issuedAt}, 'YYYY-MM') = ${month}`,
        ),
      )
      .groupBy(schema.customers.name)
      .orderBy(sql`2 desc`)
      .limit(5),
  ]);

  const units = { issued: 0, returned: 0, damaged: 0, lost: 0 };
  for (const row of movementRows) {
    if (row.type === 'ISSUE') units.issued = row.qty;
    else if (row.type === 'RETURN') units.returned = row.qty;
    else if (row.type === 'RETURN_DAMAGED') units.damaged = row.qty;
    else if (row.type === 'LOST') units.lost = row.qty;
  }

  return {
    month,
    billed: billAgg[0]?.billed ?? 0,
    billsCount: billAgg[0]?.billsCount ?? 0,
    rentBilled: billAgg[0]?.rentBilled ?? 0,
    damagesBilled: billAgg[0]?.damagesBilled ?? 0,
    received: paymentAgg[0]?.received ?? 0,
    paymentsCount: paymentAgg[0]?.paymentsCount ?? 0,
    receivedByMethod: byMethod,
    units,
    topCustomers: customerRows,
  };
}
