import { describe, expect, it } from 'vitest';

import { billIdFromPayToken, payToken, payUrl } from './pay-link';

const PEPPER = 'a-test-pepper-that-is-long-enough';
const BILL = '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

describe('pay link', () => {
  it('round-trips a bill id', () => {
    expect(billIdFromPayToken(payToken(BILL, PEPPER), PEPPER)).toBe(BILL);
  });

  it('rejects a token signed with another pepper', () => {
    expect(billIdFromPayToken(payToken(BILL, PEPPER), `${PEPPER}-other`)).toBeNull();
  });

  it('rejects a token edited to point at another bill', () => {
    const [, signature] = payToken(BILL, PEPPER).split('.');
    const other = Buffer.from('00000000000040008000000000000000', 'hex').toString('base64url');
    expect(billIdFromPayToken(`${other}.${signature}`, PEPPER)).toBeNull();
  });

  it('rejects junk', () => {
    expect(billIdFromPayToken('', PEPPER)).toBeNull();
    expect(billIdFromPayToken('abc', PEPPER)).toBeNull();
    expect(billIdFromPayToken('a.b.c', PEPPER)).toBeNull();
  });

  it('builds the public URL', () => {
    expect(payUrl('https://bismirentel.vercel.app/', BILL, PEPPER)).toMatch(
      /^https:\/\/bismirentel\.vercel\.app\/pay\/[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}$/,
    );
  });
});
