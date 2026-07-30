import { describe, expect, it } from 'vitest';

import { roundLineTotal } from './rounding';

describe('roundLineTotal', () => {
  it('rounds to the nearest rupee, half away from zero', () => {
    expect(roundLineTotal(12_349, 'nearest_rupee')).toBe(12_300);
    expect(roundLineTotal(12_350, 'nearest_rupee')).toBe(12_400);
    expect(roundLineTotal(12_351, 'nearest_rupee')).toBe(12_400);
    expect(roundLineTotal(-12_350, 'nearest_rupee')).toBe(-12_400);
  });

  it('leaves whole rupees alone', () => {
    expect(roundLineTotal(60_000, 'nearest_rupee')).toBe(60_000);
    expect(roundLineTotal(0, 'nearest_rupee')).toBe(0);
  });

  it('passes the amount through when rounding is off', () => {
    expect(roundLineTotal(12_349, 'none')).toBe(12_349);
  });
});
