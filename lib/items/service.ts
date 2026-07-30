/**
 * The item master (§01).
 *
 * Editing a rate here affects only future issues — every ISSUE carries its own
 * `rate_snapshot` (§02, §03.3). There is deliberately no rate-history table in
 * v1: a genuine renegotiation is recorded as a REVERSAL plus a fresh ISSUE at
 * the new rate on the changeover date.
 */

import { and, asc, eq } from 'drizzle-orm';

import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import { LedgerError, ERROR_CODES } from '../errors';
import type { CreateItemInput, UpdateItemInput } from '../validation/items';

export async function listItems(session: StaffSession, includeInactive = false) {
  const filters = [eq(schema.items.orgId, session.orgId)];
  if (!includeInactive) filters.push(eq(schema.items.isActive, true));

  return db()
    .select()
    .from(schema.items)
    .where(and(...filters))
    .orderBy(asc(schema.items.sortOrder), asc(schema.items.name));
}

export async function createItem(session: StaffSession, input: CreateItemInput) {
  const [row] = await db()
    .insert(schema.items)
    .values({
      orgId: session.orgId,
      name: input.name,
      code: input.code ?? null,
      unit: input.unit,
      ratePerDay: input.ratePerDay,
      replacementRate: input.replacementRate,
      purchaseCost: input.purchaseCost,
      qtyOwned: input.qtyOwned,
      sortOrder: input.sortOrder,
    })
    .onConflictDoNothing({ target: [schema.items.orgId, schema.items.code] })
    .returning();

  if (!row) {
    throw new LedgerError(ERROR_CODES.CONFLICT, 'An item already uses that code.', {
      field: 'code',
    });
  }

  return row;
}

export async function updateItem(
  session: StaffSession,
  itemId: string,
  input: UpdateItemInput,
) {
  const [row] = await db()
    .update(schema.items)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.unit === undefined ? {} : { unit: input.unit }),
      ...(input.ratePerDay === undefined ? {} : { ratePerDay: input.ratePerDay }),
      ...(input.replacementRate === undefined ? {} : { replacementRate: input.replacementRate }),
      ...(input.purchaseCost === undefined ? {} : { purchaseCost: input.purchaseCost }),
      ...(input.qtyOwned === undefined ? {} : { qtyOwned: input.qtyOwned }),
      ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    })
    .where(and(eq(schema.items.id, itemId), eq(schema.items.orgId, session.orgId)))
    .returning();

  if (!row) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That item was not found.');
  return row;
}
