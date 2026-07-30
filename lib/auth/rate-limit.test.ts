import { describe, expect, it } from 'vitest';

import { ERROR_CODES, LedgerError } from '../errors';
import { assertLookupAllowed, MOBILE_LOOKUP_LIMITS, windowStart } from './rate-limit';

describe('assertLookupAllowed', () => {
  it('allows a lookup under both limits', () => {
    expect(() => assertLookupAllowed({ byMobile: 0, byIp: 0 })).not.toThrow();
    expect(() => assertLookupAllowed({ byMobile: 4, byIp: 19 })).not.toThrow();
  });

  it('blocks once the per-number limit is spent', () => {
    // This is the limit that matters: it caps how fast one contractor's number
    // can be probed, even from a rotating set of addresses.
    try {
      assertLookupAllowed({ byMobile: MOBILE_LOOKUP_LIMITS.perMobile.max, byIp: 0 });
      expect.unreachable('should have been rate limited');
    } catch (error) {
      expect(error).toBeInstanceOf(LedgerError);
      expect((error as LedgerError).code).toBe(ERROR_CODES.RATE_LIMITED);
      expect((error as LedgerError).status).toBe(429);
      expect((error as LedgerError).context).toMatchObject({ scope: 'mobile' });
    }
  });

  it('blocks once the per-address limit is spent', () => {
    try {
      assertLookupAllowed({ byMobile: 0, byIp: MOBILE_LOOKUP_LIMITS.perIp.max });
      expect.unreachable('should have been rate limited');
    } catch (error) {
      expect((error as LedgerError).context).toMatchObject({ scope: 'ip' });
    }
  });

  it('reports the number limit first when both are spent', () => {
    try {
      assertLookupAllowed({ byMobile: 99, byIp: 99 });
      expect.unreachable('should have been rate limited');
    } catch (error) {
      expect((error as LedgerError).context).toMatchObject({ scope: 'mobile' });
    }
  });

  it('keeps the limits tight enough to make enumeration useless', () => {
    // 5 attempts per 15 minutes per number is 480/day. Walking even one
    // 10-digit prefix block would take centuries.
    expect(MOBILE_LOOKUP_LIMITS.perMobile.max).toBeLessThanOrEqual(5);
    expect(MOBILE_LOOKUP_LIMITS.perIp.max).toBeLessThanOrEqual(20);
  });
});

describe('windowStart', () => {
  it('rolls back by the rule window', () => {
    const now = new Date('2026-07-30T10:00:00.000Z');
    expect(windowStart(now, { windowMinutes: 15, max: 5 }).toISOString()).toBe(
      '2026-07-30T09:45:00.000Z',
    );
  });
});
