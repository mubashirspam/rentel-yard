import { describe, expect, it } from 'vitest';

import { LedgerError } from './errors';
import { formatPaise, rupeesToPaise } from './money';

describe('rupeesToPaise', () => {
  it('parses whole rupees, decimals, and grouped input', () => {
    expect(rupeesToPaise('2')).toBe(200);
    expect(rupeesToPaise('2.00')).toBe(200);
    expect(rupeesToPaise('450')).toBe(45_000);
    expect(rupeesToPaise('1,250.50')).toBe(125_050);
    expect(rupeesToPaise('0.05')).toBe(5);
    expect(rupeesToPaise('0.5')).toBe(50);
    expect(rupeesToPaise('-99.99')).toBe(-9_999);
  });

  it('rejects anything that is not an amount', () => {
    for (const value of ['', 'abc', '1.234', '₹5', '1.2.3']) {
      expect(() => rupeesToPaise(value)).toThrowError(LedgerError);
    }
  });
});

describe('formatPaise', () => {
  it('groups in the Indian style', () => {
    expect(formatPaise(570_000)).toBe('₹5,700');
    expect(formatPaise(1_570_000)).toBe('₹15,700');
    expect(formatPaise(100_000_00)).toBe('₹1,00,000');
    expect(formatPaise(1_000_000_00)).toBe('₹10,00,000');
  });

  it('shows paise only when there are any, unless asked', () => {
    expect(formatPaise(200)).toBe('₹2');
    expect(formatPaise(250)).toBe('₹2.50');
    expect(formatPaise(205)).toBe('₹2.05');
    expect(formatPaise(200, { paiseDigits: true })).toBe('₹2.00');
  });

  it('handles zero, negatives, and a bare rendering', () => {
    expect(formatPaise(0)).toBe('₹0');
    expect(formatPaise(-570_000)).toBe('-₹5,700');
    expect(formatPaise(570_000, { symbol: false })).toBe('5,700');
  });

  it('refuses a fractional paise amount rather than rounding it quietly', () => {
    expect(() => formatPaise(1.5)).toThrowError(LedgerError);
  });

  it('round-trips against rupeesToPaise', () => {
    for (const value of ['5,700', '2.50', '0.05', '1,00,000']) {
      expect(formatPaise(rupeesToPaise(value), { symbol: false })).toBe(value);
    }
  });
});
