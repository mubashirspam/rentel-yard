import { describe, expect, it } from 'vitest';

import { ERROR_CODES, LedgerError } from '../errors';
import { formatMobile, normaliseMobile, toWhatsAppNumber, tryNormaliseMobile } from './mobile';

describe('normaliseMobile', () => {
  it('collapses every way a yard worker might type one number', () => {
    // All of these are the same contractor. If they normalise differently, he
    // ends up with two khatas and two balances.
    for (const input of [
      '9846012345',
      '09846012345',
      '+919846012345',
      '+91 98460 12345',
      '91-9846012345',
      '  +91 9846 012 345  ',
      '(0)9846012345',
    ]) {
      expect(normaliseMobile(input)).toBe('+919846012345');
    }
  });

  it('accepts any of the valid Indian mobile prefixes', () => {
    for (const prefix of ['6', '7', '8', '9']) {
      expect(normaliseMobile(`${prefix}123456789`)).toBe(`+91${prefix}123456789`);
    }
  });

  it('keeps a foreign number that arrives in full E.164 form', () => {
    expect(normaliseMobile('+971501234567')).toBe('+971501234567');
  });

  it('rejects what is not a mobile number', () => {
    for (const input of ['', '   ', 'abcdefghij', '12345', '5123456789', '98460123456789012']) {
      try {
        normaliseMobile(input);
        expect.unreachable(`"${input}" should have been rejected`);
      } catch (error) {
        expect(error).toBeInstanceOf(LedgerError);
        expect((error as LedgerError).code).toBe(ERROR_CODES.INVALID_MOBILE);
      }
    }
  });

  it('rejects a landline-style 10-digit number starting below 6', () => {
    expect(tryNormaliseMobile('4842345678')).toBeNull();
  });

  it('is idempotent', () => {
    const once = normaliseMobile('9846012345');
    expect(normaliseMobile(once)).toBe(once);
  });
});

describe('formatMobile and toWhatsAppNumber', () => {
  it('formats an Indian number for display', () => {
    expect(formatMobile('+919846012345')).toBe('98460 12345');
  });

  it('leaves a foreign number alone', () => {
    expect(formatMobile('+971501234567')).toBe('+971501234567');
  });

  it('strips the plus for wa.me', () => {
    expect(toWhatsAppNumber('+919846012345')).toBe('919846012345');
  });
});
