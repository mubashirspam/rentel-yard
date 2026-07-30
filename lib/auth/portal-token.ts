/**
 * Portal token cryptography (§05.4) — pure, no database.
 *
 * A customer never has a password. Access is granted by an unguessable token
 * that reaches them one of two ways:
 *
 *   admin_link    — the admin taps "Share statement" and sends the link over
 *                   WhatsApp. Long-lived (settings.portalTokenDays).
 *   mobile_lookup — the customer typed their own number on the public page.
 *                   Short-lived, because the only thing behind it is knowing
 *                   a phone number.
 *
 * Only the peppered SHA-256 hash is stored. A leaked database therefore does
 * not hand anyone a working link, and the pepper lives in an env var rather
 * than in Postgres.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { LedgerError, ERROR_CODES } from '../errors';

export type PortalTokenSource = 'admin_link' | 'mobile_lookup';

/** 32 random bytes, per §05.4. */
const TOKEN_BYTES = 32;

/** A mobile-lookup session is deliberately much shorter than a shared link. */
export const MOBILE_LOOKUP_TTL_HOURS = 24;

/** The cookie the portal sets so a refresh works without the URL token. */
export const PORTAL_COOKIE = 'yl_portal';

export interface MintedToken {
  /** The raw token. Returned exactly once, then never recoverable. */
  raw: string;
  /** What goes in `portal_tokens.token_hash`. */
  hash: string;
}

/** Generate a fresh token and its stored hash. */
export function mintToken(pepper: string): MintedToken {
  requirePepper(pepper);
  const raw = randomBytes(TOKEN_BYTES).toString('base64url');
  return { raw, hash: hashToken(raw, pepper) };
}

/** SHA-256 of the pepper and the raw token. Deterministic — used for lookup. */
export function hashToken(raw: string, pepper: string): string {
  requirePepper(pepper);
  return createHash('sha256').update(`${pepper}:${raw}`).digest('hex');
}

/**
 * Hash a mobile number for the `portal_lookups` audit table.
 *
 * Hashed so that table is not a harvestable list of every contractor's phone
 * number, while still working as a rate-limit key.
 */
export function hashMobile(e164: string, pepper: string): string {
  requirePepper(pepper);
  return createHash('sha256').update(`mobile:${pepper}:${e164}`).digest('hex');
}

/** Hash a client address for the same reason. */
export function hashIp(ip: string, pepper: string): string {
  requirePepper(pepper);
  return createHash('sha256').update(`ip:${pepper}:${ip}`).digest('hex');
}

/** Constant-time hash comparison, for paths that compare rather than look up. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface TokenRecord {
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Whether a stored token row is still usable.
 *
 * Kept separate from the database lookup so it is trivially testable and so
 * both entry points apply exactly the same rule.
 */
export function isTokenUsable(record: TokenRecord, now: Date): boolean {
  if (record.revokedAt !== null && record.revokedAt <= now) return false;
  return record.expiresAt > now;
}

/**
 * Throws the single error a customer ever sees for a bad token.
 *
 * Deliberately identical for unknown, expired, and revoked: a stranger poking
 * at `/s/<guess>` learns nothing about whether a token ever existed.
 */
export function tokenInvalid(): LedgerError {
  return new LedgerError(
    ERROR_CODES.PORTAL_TOKEN_INVALID,
    'This link has expired — contact the yard for a new one.',
  );
}

export function expiryFromNow(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function expiryFromNowHours(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function requirePepper(pepper: string): void {
  if (!pepper || pepper.length < 16) {
    throw new LedgerError(
      ERROR_CODES.INVALID_CONFIG,
      'PORTAL_TOKEN_PEPPER is missing or too short.',
      { field: 'PORTAL_TOKEN_PEPPER' },
    );
  }
}
