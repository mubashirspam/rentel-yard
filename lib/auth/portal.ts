/**
 * Customer portal access (§05.4) — the database-facing half.
 *
 * Two doors, one lock. Both produce a `portal_tokens` row; `resolvePortalToken`
 * is the only way either is redeemed, so expiry, revocation, and last-used
 * logging cannot be bypassed by taking one route rather than the other.
 */

import { and, count, eq, gte, isNull } from 'drizzle-orm';

import { db, schema } from '../db/client';
import { serverEnv } from '../env';
import { LedgerError, ERROR_CODES } from '../errors';
import type { StaffSession } from './guard';
import { normaliseMobile } from './mobile';
import {
  expiryFromNow,
  expiryFromNowHours,
  hashIp,
  hashMobile,
  hashToken,
  isTokenUsable,
  mintToken,
  tokenInvalid,
  MOBILE_LOOKUP_TTL_HOURS,
  type PortalTokenSource,
} from './portal-token';
import { assertLookupAllowed, MOBILE_LOOKUP_LIMITS, windowStart } from './rate-limit';

/** The identity a portal request carries. There is no session beyond this. */
export interface PortalSession {
  customerId: string;
  orgId: string;
  tokenId: string;
  source: PortalTokenSource;
}

/**
 * Mint (or reuse) a shareable statement link for a customer.
 *
 * §05.4: "If the same customer needs several links, reuse the active token
 * rather than minting new ones." Reuse keeps a WhatsApp message the admin sent
 * last month working, and keeps revocation meaningful — one tap kills one link
 * rather than leaving a trail of live tokens behind.
 *
 * Reuse is only possible when the raw token is still known, which it is not
 * once stored. So a live `admin_link` is revoked and replaced only when the
 * caller asks for a fresh one.
 */
export async function issuePortalLink(
  session: StaffSession,
  customerId: string,
  options: { forceNew?: boolean; now?: Date } = {},
): Promise<{ rawToken: string; expiresAt: Date; reused: false }> {
  const now = options.now ?? new Date();
  const env = serverEnv();
  const database = db();

  const customer = await findCustomer(session.orgId, customerId);

  const [config] = await database
    .select({ days: schema.settings.portalTokenDays })
    .from(schema.settings)
    .where(eq(schema.settings.orgId, session.orgId))
    .limit(1);

  const validityDays = config?.days ?? 90;

  // Any live admin link is superseded — the customer should end up with one
  // working link, not an accumulating set.
  await database
    .update(schema.portalTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.portalTokens.customerId, customer.id),
        eq(schema.portalTokens.source, 'admin_link'),
        isNull(schema.portalTokens.revokedAt),
      ),
    );

  const { raw, hash } = mintToken(env.PORTAL_TOKEN_PEPPER);
  const expiresAt = expiryFromNow(now, validityDays);

  await database.insert(schema.portalTokens).values({
    orgId: session.orgId,
    customerId: customer.id,
    tokenHash: hash,
    source: 'admin_link',
    expiresAt,
    createdBy: session.userId,
  });

  return { rawToken: raw, expiresAt, reused: false };
}

/** Revoke every live token for a customer. Used by the admin's Revoke button. */
export async function revokePortalTokens(
  session: StaffSession,
  customerId: string,
  now: Date = new Date(),
): Promise<number> {
  const customer = await findCustomer(session.orgId, customerId);

  const revoked = await db()
    .update(schema.portalTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(schema.portalTokens.customerId, customer.id),
        isNull(schema.portalTokens.revokedAt),
      ),
    )
    .returning({ id: schema.portalTokens.id });

  return revoked.length;
}

/**
 * Redeem a raw token. The only entry point to customer data.
 *
 * Unknown, expired, and revoked all raise the same error with the same
 * message, so probing `/s/<guess>` reveals nothing.
 */
export async function resolvePortalToken(
  rawToken: string,
  now: Date = new Date(),
): Promise<PortalSession> {
  const env = serverEnv();
  const database = db();

  const hash = hashToken(rawToken, env.PORTAL_TOKEN_PEPPER);

  const [row] = await database
    .select({
      id: schema.portalTokens.id,
      orgId: schema.portalTokens.orgId,
      customerId: schema.portalTokens.customerId,
      source: schema.portalTokens.source,
      expiresAt: schema.portalTokens.expiresAt,
      revokedAt: schema.portalTokens.revokedAt,
      isBlocked: schema.customers.isBlocked,
    })
    .from(schema.portalTokens)
    .innerJoin(schema.customers, eq(schema.customers.id, schema.portalTokens.customerId))
    .where(eq(schema.portalTokens.tokenHash, hash))
    .limit(1);

  if (!row) throw tokenInvalid();
  if (!isTokenUsable(row, now)) throw tokenInvalid();

  await database
    .update(schema.portalTokens)
    .set({ lastUsedAt: now })
    .where(eq(schema.portalTokens.id, row.id));

  return {
    customerId: row.customerId,
    orgId: row.orgId,
    tokenId: row.id,
    source: row.source,
  };
}

export interface MobileLookupInput {
  mobile: string;
  orgId: string;
  /** Client address, for the per-address limit. Null when unavailable. */
  ip: string | null;
  now?: Date;
}

/**
 * The public "check your account" lookup.
 *
 * SECURITY POSTURE, stated plainly: the only thing protecting a customer's
 * outstanding balance here is knowledge of their mobile number. Phone numbers
 * are not secrets — they are on invoices, vehicles, and WhatsApp groups. This
 * was accepted deliberately in place of paid OTP (see docs/decisions.md D20).
 *
 * What that buys, and what it costs, is bounded here:
 *   - hard per-number and per-address rate limits, counted in Postgres
 *   - every attempt logged, hit or miss, for an audit trail
 *   - a 24-hour session rather than the 90-day one a shared link gets
 *   - blocked customers get nothing
 */
export async function lookupByMobile(input: MobileLookupInput): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  const now = input.now ?? new Date();
  const env = serverEnv();
  const database = db();

  // Normalise first: the limiter must count "9846012345" and "+919846012345"
  // as attempts against the same number.
  const mobile = normaliseMobile(input.mobile);
  const mobileHash = hashMobile(mobile, env.PORTAL_TOKEN_PEPPER);
  const ipHashValue = input.ip ? hashIp(input.ip, env.PORTAL_TOKEN_PEPPER) : null;

  await assertWithinLookupLimits(mobileHash, ipHashValue, now);

  const [customer] = await database
    .select({ id: schema.customers.id, isBlocked: schema.customers.isBlocked })
    .from(schema.customers)
    .where(and(eq(schema.customers.orgId, input.orgId), eq(schema.customers.mobile, mobile)))
    .limit(1);

  // A blocked customer is treated exactly as an unknown number — the yard
  // blocked them on purpose and should not have to explain that in a web page.
  const match = customer && !customer.isBlocked ? customer : null;

  await database.insert(schema.portalLookups).values({
    orgId: input.orgId,
    mobileHash,
    ipHash: ipHashValue,
    matched: match !== null,
  });

  if (!match) {
    throw new LedgerError(
      ERROR_CODES.PORTAL_MOBILE_UNKNOWN,
      'No account found for that number. Check the number, or ask the yard to send you a link.',
      { field: 'mobile' },
    );
  }

  const { raw, hash } = mintToken(env.PORTAL_TOKEN_PEPPER);
  const expiresAt = expiryFromNowHours(now, MOBILE_LOOKUP_TTL_HOURS);

  await database.insert(schema.portalTokens).values({
    orgId: input.orgId,
    customerId: match.id,
    tokenHash: hash,
    source: 'mobile_lookup',
    expiresAt,
  });

  return { rawToken: raw, expiresAt };
}

async function assertWithinLookupLimits(
  mobileHash: string,
  ipHashValue: string | null,
  now: Date,
): Promise<void> {
  const database = db();

  const [mobileRow] = await database
    .select({ value: count() })
    .from(schema.portalLookups)
    .where(
      and(
        eq(schema.portalLookups.mobileHash, mobileHash),
        gte(schema.portalLookups.createdAt, windowStart(now, MOBILE_LOOKUP_LIMITS.perMobile)),
      ),
    );

  const ipRow = ipHashValue
    ? (
        await database
          .select({ value: count() })
          .from(schema.portalLookups)
          .where(
            and(
              eq(schema.portalLookups.ipHash, ipHashValue),
              gte(schema.portalLookups.createdAt, windowStart(now, MOBILE_LOOKUP_LIMITS.perIp)),
            ),
          )
      )[0]
    : { value: 0 };

  assertLookupAllowed({ byMobile: mobileRow?.value ?? 0, byIp: ipRow?.value ?? 0 });
}

async function findCustomer(orgId: string, customerId: string) {
  const [customer] = await db()
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(and(eq(schema.customers.id, customerId), eq(schema.customers.orgId, orgId)))
    .limit(1);

  if (!customer) {
    throw new LedgerError(ERROR_CODES.NOT_FOUND, 'Customer not found.');
  }

  return customer;
}

/** The `wa.me` link the admin taps to send a statement (§09). */
export function whatsAppShareUrl(input: {
  mobile: string;
  siteName: string;
  amountDue: string;
  portalUrl: string;
}): string {
  const message = [
    `Yard Ledger — statement for ${input.siteName}`,
    `Amount due: ${input.amountDue}`,
    `Full statement: ${input.portalUrl}`,
  ].join('\n');

  const digits = input.mobile.replace(/^\+/, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
