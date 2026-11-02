/**
 * Org settings that a screen can change (§11).
 *
 * The message language, and where customers pay (D70). The billing rules, invoice format and
 * terms live in the same row and get their own screen at M7 — those change
 * what a bill *charges*, so they need the care D57 describes rather than a
 * toggle.
 */

import { eq } from 'drizzle-orm';

import { DEFAULT_BILLING_CONFIG } from '../accrual';
import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import type { MessageLanguage } from '../messages';
import { EMPTY_PAYMENT_DETAILS, type PaymentDetails } from '../payments/upi';

export interface YardSettings {
  messageLanguage: MessageLanguage;
  yardName: string;
  payment: PaymentDetails;
}

export async function getSettings(session: StaffSession): Promise<YardSettings> {
  const database = db();

  const [row] = await database
    .select({ messageLanguage: schema.settings.messageLanguage })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, session.orgId))
    .limit(1);
  const payment = await loadPaymentDetails(session.orgId);

  const [org] = await database
    .select({ name: schema.orgs.name })
    .from(schema.orgs)
    .where(eq(schema.orgs.id, session.orgId))
    .limit(1);

  return {
    // A yard that has never opened this screen has no settings row yet.
    messageLanguage: row?.messageLanguage ?? 'en',
    yardName: org?.name ?? 'Bismi Rental',
    payment,
  };
}

/**
 * Where customers pay, for one org. No session: the public pay page and the
 * PDF read it for a bill they have already been allowed to see.
 */
export async function loadPaymentDetails(orgId: string): Promise<PaymentDetails> {
  const [row] = await db()
    .select({
      payeeName: schema.settings.payeeName,
      upiId: schema.settings.upiId,
      bankName: schema.settings.bankName,
      bankAccountName: schema.settings.bankAccountName,
      bankAccountNumber: schema.settings.bankAccountNumber,
      bankIfsc: schema.settings.bankIfsc,
    })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, orgId))
    .limit(1);
  return row ?? EMPTY_PAYMENT_DETAILS;
}

/** Owner only (the route checks `settings.manage`). Empty strings clear a field. */
export async function setPaymentDetails(
  session: StaffSession,
  details: PaymentDetails,
): Promise<PaymentDetails> {
  const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
  const values = {
    payeeName: clean(details.payeeName),
    upiId: clean(details.upiId),
    bankName: clean(details.bankName),
    bankAccountName: clean(details.bankAccountName),
    bankAccountNumber: clean(details.bankAccountNumber),
    bankIfsc: clean(details.bankIfsc)?.toUpperCase() ?? null,
  };

  await db()
    .insert(schema.settings)
    .values({ orgId: session.orgId, billing: DEFAULT_BILLING_CONFIG, ...values })
    .onConflictDoUpdate({
      target: schema.settings.orgId,
      set: { ...values, updatedAt: new Date() },
    });

  return values;
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
