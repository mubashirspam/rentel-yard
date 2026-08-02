/**
 * Org settings that a screen can change (§11).
 *
 * Only the message language so far. The billing rules, invoice format and
 * terms live in the same row and get their own screen at M7 — those change
 * what a bill *charges*, so they need the care D57 describes rather than a
 * toggle.
 */

import { eq } from 'drizzle-orm';

import { DEFAULT_BILLING_CONFIG } from '../accrual';
import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import type { MessageLanguage } from '../messages';

export interface YardSettings {
  messageLanguage: MessageLanguage;
  yardName: string;
}

export async function getSettings(session: StaffSession): Promise<YardSettings> {
  const database = db();

  const [row] = await database
    .select({ messageLanguage: schema.settings.messageLanguage })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, session.orgId))
    .limit(1);

  const [org] = await database
    .select({ name: schema.orgs.name })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, session.orgId))
    .limit(1);

  return {
    // A yard that has never opened this screen has no settings row yet.
    messageLanguage: row?.messageLanguage ?? 'en',
    yardName: org?.name ?? 'Bismi Rental',
  };
}

/** Just the language, for the many callers that only need to pick a template. */
export async function messageLanguage(session: StaffSession): Promise<MessageLanguage> {
  return (await getSettings(session)).messageLanguage;
}

export async function setMessageLanguage(
  session: StaffSession,
  language: MessageLanguage,
): Promise<void> {
  const database = db();

  await database
    .insert(schema.settings)
    .values({ orgId: session.orgId, billing: DEFAULT_BILLING_CONFIG, messageLanguage: language })
    .onConflictDoUpdate({
      target: schema.settings.orgId,
      set: { messageLanguage: language, updatedAt: new Date() },
    });
}
