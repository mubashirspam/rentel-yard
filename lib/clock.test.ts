import { describe, expect, it } from 'vitest';

import { today } from './clock';

describe('today', () => {
  it('returns a YYYY-MM-DD calendar date', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses the yard’s date, not the server’s', () => {
    // 20:00 UTC on 29 July is already 01:30 on 30 July in Kolkata. A UTC
    // server would date this gate pass a day early.
    expect(today(new Date('2026-07-29T20:00:00Z'))).toBe('2026-07-30');
  });

  it('has not rolled over just before midnight IST', () => {
    // 18:29 UTC is 23:59 IST on the same day.
    expect(today(new Date('2026-07-30T18:29:00Z'))).toBe('2026-07-30');
  });

  it('rolls over exactly at midnight IST', () => {
    expect(today(new Date('2026-07-30T18:30:00Z'))).toBe('2026-07-31');
  });

  it('handles a year boundary', () => {
    expect(today(new Date('2025-12-31T19:00:00Z'))).toBe('2026-01-01');
  });
});
