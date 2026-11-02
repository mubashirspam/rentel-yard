/**
 * The public "pay this bill" link (D70): `/pay/<token>`.
 *
 * Stateless. The token is the bill id plus an HMAC of it under the portal
 * pepper, so it cannot be guessed or edited to reach another bill, and needs
 * no table. What it opens is read-only: the bill's own figures, its balance
 * and the yard's payment details — what the PDF already carries. A bill link
 * has no expiry for the same reason a printed bill has none.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const SIGNATURE_LENGTH = 22; // 132 bits of base64url

function sign(billId: string, pepper: string): string {
  if (pepper.length < 16) throw new Error('A pepper of at least 16 characters is required.');
  return createHmac('sha256', `bill-pay:${pepper}`)
    .update(billId)
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH);
}

/** The UUID's 16 bytes as base64url — 22 characters instead of 36. */
function encodeId(billId: string): string {
  return Buffer.from(billId.replace(/-/g, ''), 'hex').toString('base64url');
}

function decodeId(encoded: string): string | null {
  const hex = Buffer.from(encoded, 'base64url').toString('hex');
  if (hex.length !== 32) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function payToken(billId: string, pepper: string): string {
  return `${encodeId(billId)}.${sign(billId.toLowerCase(), pepper)}`;
}

/** The bill id behind a token, or null when the token is not one we signed. */
export function billIdFromPayToken(token: string, pepper: string): string | null {
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra !== undefined) return null;

  const billId = decodeId(encoded);
  if (!billId) return null;

  const expected = Buffer.from(sign(billId, pepper));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return billId;
}

export function payUrl(appUrl: string, billId: string, pepper: string): string {
  return `${appUrl.replace(/\/$/, '')}/pay/${payToken(billId, pepper)}`;
}
