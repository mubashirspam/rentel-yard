import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_NUMBER_PATTERN,
  IFSC_PATTERN,
  paiseToUpiAmount,
  UPI_ID_PATTERN,
  upiPayUri,
} from './upi';

describe('paiseToUpiAmount', () => {
  it('writes two decimals from whole paise', () => {
    expect(paiseToUpiAmount(79500)).toBe('795.00');
    expect(paiseToUpiAmount(12345)).toBe('123.45');
    expect(paiseToUpiAmount(5)).toBe('0.05');
    expect(paiseToUpiAmount(0)).toBe('0.00');
  });

  it('refuses fractions and negatives', () => {
    expect(() => paiseToUpiAmount(1.5)).toThrow();
    expect(() => paiseToUpiAmount(-100)).toThrow();
  });
});

describe('upiPayUri', () => {
  it('fills payee, amount, currency and note', () => {
    expect(
      upiPayUri({
        upiId: 'bismi@okaxis',
        payeeName: 'Bismi Rental',
        amount: 79500,
        note: 'INV-2026-0003',
      }),
    ).toBe('upi://pay?pa=bismi%40okaxis&pn=Bismi%20Rental&am=795.00&cu=INR&tn=INV-2026-0003');
  });

  it('leaves the amount open when there is none', () => {
    expect(upiPayUri({ upiId: 'a@b', payeeName: 'X' })).toBe('upi://pay?pa=a%40b&pn=X&cu=INR');
  });
});

describe('patterns', () => {
  it('accepts real-looking UPI IDs and rejects others', () => {
    expect(UPI_ID_PATTERN.test('bismi.rental@okaxis')).toBe(true);
    expect(UPI_ID_PATTERN.test('9562229979@ybl')).toBe(true);
    expect(UPI_ID_PATTERN.test('no-at-sign')).toBe(false);
    expect(UPI_ID_PATTERN.test('a@1bank')).toBe(false);
  });

  it('checks IFSC and account number shapes', () => {
    expect(IFSC_PATTERN.test('SBIN0001234')).toBe(true);
    expect(IFSC_PATTERN.test('SBIN1001234')).toBe(false);
    expect(ACCOUNT_NUMBER_PATTERN.test('123456789012')).toBe(true);
    expect(ACCOUNT_NUMBER_PATTERN.test('12AB')).toBe(false);
  });
});
