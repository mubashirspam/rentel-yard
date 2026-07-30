import { describe, expect, it } from 'vitest';

import { ERROR_CODES, LedgerError } from '../errors';
import {
  expiryFromNow,
  expiryFromNowHours,
  hashesMatch,
  hashIp,
  hashMobile,
  hashToken,
  isTokenUsable,
  mintToken,
  tokenInvalid,
} from './portal-token';

const PEPPER = 'a-test-pepper-at-least-16-chars';

describe('mintToken', () => {
  it('returns a raw token and its stored hash', () => {
    const { raw, hash } = mintToken(PEPPER);

    expect(raw.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(hash).toHaveLength(64); // sha256 hex
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => mintToken(PEPPER).raw));
    expect(tokens.size).toBe(200);
  });

  it('is URL-safe, so it survives being pasted into WhatsApp', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(mintToken(PEPPER).raw).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('refuses to mint without a usable pepper', () => {
    for (const pepper of ['', 'too-short']) {
      try {
        mintToken(pepper);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect((error as LedgerError).code).toBe(ERROR_CODES.INVALID_CONFIG);
      }
    }
  });
});

describe('hashToken', () => {
  it('is deterministic, so the raw token can be looked up', () => {
    const { raw, hash } = mintToken(PEPPER);
    expect(hashToken(raw, PEPPER)).toBe(hash);
  });

  it('depends on the pepper, so a leaked database is not enough', () => {
    const { raw, hash } = mintToken(PEPPER);
    expect(hashToken(raw, 'a-different-pepper-16-chars')).not.toBe(hash);
  });

  it('does not contain the raw token', () => {
    const { raw, hash } = mintToken(PEPPER);
    expect(hash).not.toContain(raw);
  });
});

describe('hashMobile and hashIp', () => {
  it('are deterministic and domain-separated', () => {
    const mobile = '+919846012345';
    expect(hashMobile(mobile, PEPPER)).toBe(hashMobile(mobile, PEPPER));
    // Same input, different purpose, different hash — so the lookups table
    // cannot be cross-referenced against anything else.
    expect(hashMobile(mobile, PEPPER)).not.toBe(hashIp(mobile, PEPPER));
  });

  it('differ per number, so they still work as a rate-limit key', () => {
    expect(hashMobile('+919846012345', PEPPER)).not.toBe(hashMobile('+919846012346', PEPPER));
  });
});

describe('hashesMatch', () => {
  it('compares equal and unequal hashes', () => {
    const { raw, hash } = mintToken(PEPPER);
    expect(hashesMatch(hashToken(raw, PEPPER), hash)).toBe(true);
    expect(hashesMatch(hash, hash.slice(0, -1) + '0')).toBe(false);
  });

  it('returns false on a length mismatch rather than throwing', () => {
    expect(hashesMatch('abc', 'abcd')).toBe(false);
  });
});

describe('isTokenUsable', () => {
  const now = new Date('2026-07-30T10:00:00.000Z');

  it('accepts a live token', () => {
    expect(isTokenUsable({ expiresAt: new Date('2026-08-30T00:00:00Z'), revokedAt: null }, now)).toBe(
      true,
    );
  });

  it('rejects an expired token', () => {
    expect(isTokenUsable({ expiresAt: new Date('2026-07-29T00:00:00Z'), revokedAt: null }, now)).toBe(
      false,
    );
  });

  it('rejects a revoked token even when it has not expired', () => {
    expect(
      isTokenUsable(
        { expiresAt: new Date('2026-08-30T00:00:00Z'), revokedAt: new Date('2026-07-20T00:00:00Z') },
        now,
      ),
    ).toBe(false);
  });

  it('rejects a token that expires exactly now', () => {
    expect(isTokenUsable({ expiresAt: now, revokedAt: null }, now)).toBe(false);
  });
});

describe('tokenInvalid', () => {
  it('says the same thing whatever went wrong', () => {
    // Unknown, expired, and revoked must be indistinguishable, or probing
    // /s/<guess> tells a stranger which tokens once existed.
    const error = tokenInvalid();
    expect(error.code).toBe(ERROR_CODES.PORTAL_TOKEN_INVALID);
    expect(error.message).toBe('This link has expired — contact the yard for a new one.');
    expect(error.status).toBe(401);
    expect(error.context).toBeUndefined();
  });
});

describe('expiry helpers', () => {
  const now = new Date('2026-07-30T10:00:00.000Z');

  it('adds whole days for a shared link', () => {
    expect(expiryFromNow(now, 90).toISOString()).toBe('2026-10-28T10:00:00.000Z');
  });

  it('adds hours for a mobile-lookup session', () => {
    expect(expiryFromNowHours(now, 24).toISOString()).toBe('2026-07-31T10:00:00.000Z');
  });
});
