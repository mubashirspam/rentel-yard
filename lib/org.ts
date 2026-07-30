/**
 * The yard's own name, for anything addressed to a customer.
 *
 * It heads every bill and opens every WhatsApp message, so it is worth one
 * small query rather than a hardcoded string.
 */

import { eq } from 'drizzle-orm';

import type { StaffSession } from './auth/guard';
import { db, schema } from './db/client';

export async function orgName(session: StaffSession): Promise<string> {
  const [row] = await db()
    .select({ name: schema.orgs.name })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, session.orgId))
    .limit(1);

  return row?.name ?? 'Yard Ledger';
}
