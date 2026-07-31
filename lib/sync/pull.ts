/**
 * Cursor-based pull (§07.3).
 *
 * "Rows with a higher sequence, capped at 500 per page. Use a monotonic
 * `server_seq` bigint column — a sequence, not a timestamp, because clocks are
 * unreliable."
 *
 * One global sequence spans every mirrored table (D17), so the device holds a
 * single number rather than one cursor per table, and rows arrive in the order
 * the server committed them. A `BEFORE UPDATE` trigger bumps the sequence on
 * edit, so a corrected customer is re-sent rather than silently diverging on
 * every device that already synced past it.
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import { MIRRORED_TABLES, type MirroredTable, type SyncPullResult } from './protocol';

/** Where the sequence stands right now, for a device that is up to date. */
export async function currentCursor(session: StaffSession): Promise<number> {
  const [row] = await db()
    .select({ value: sql<number>`coalesce(last_value, 0)::bigint` })
    .from(sql`sync_seq`);

  void session;
  return Number(row?.value ?? 0);
}

/**
 * Everything that changed after `cursor`, oldest first.
 *
 * Deletes are not a case the client has to handle: the ledger is append-only
 * and nothing else in the mirrored set is ever deleted — an item is retired, a
 * user is deactivated, an account is closed (§11).
 */
export async function pullChanges(
  session: StaffSession,
  cursor: number,
  limit: number,
): Promise<SyncPullResult> {
  const org = session.orgId;

  const [items, customers, accounts, movements, payments] = await Promise.all([
    db()
      .select()
      .from(schema.items)
      .where(and(eq(schema.items.orgId, org), gt(schema.items.serverSeq, cursor)))
      .orderBy(asc(schema.items.serverSeq))
      .limit(limit),
    db()
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.orgId, org), gt(schema.customers.serverSeq, cursor)))
      .orderBy(asc(schema.customers.serverSeq))
      .limit(limit),
    db()
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.orgId, org), gt(schema.accounts.serverSeq, cursor)))
      .orderBy(asc(schema.accounts.serverSeq))
      .limit(limit),
    db()
      .select()
      .from(schema.movements)
      .where(and(eq(schema.movements.orgId, org), gt(schema.movements.serverSeq, cursor)))
      .orderBy(asc(schema.movements.serverSeq))
      .limit(limit),
    db()
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.orgId, org), gt(schema.payments.serverSeq, cursor)))
      .orderBy(asc(schema.payments.serverSeq))
      .limit(limit),
  ]);

  const changes = { items, customers, accounts, movements, payments } as Record<
    MirroredTable,
    Array<{ serverSeq: number }>
  >;

  // Advance only as far as every table was read, so a capped page never skips
  // a row: if one table filled its 500 and another did not, the next pull
  // starts from the lowest safe point and re-reads a few rows harmlessly.
  const hasMore = MIRRORED_TABLES.some((table) => changes[table].length === limit);

  const highest = MIRRORED_TABLES.flatMap((table) => changes[table]).map((row) =>
    Number(row.serverSeq),
  );

  const capped = MIRRORED_TABLES.filter((table) => changes[table].length === limit).map((table) =>
    Number(changes[table][limit - 1].serverSeq),
  );

  const next = hasMore
    ? Math.min(...capped)
    : highest.length > 0
      ? Math.max(...highest)
      : cursor;

  return {
    changes: changes as SyncPullResult['changes'],
    cursor: next,
    hasMore,
    serverTime: new Date().toISOString(),
  };
}
