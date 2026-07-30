import { describe, expect, it } from 'vitest';

import { ERROR_CODES, LedgerError } from '../errors';
import { addDays, compareIsoDates, differenceInCalendarDays, fromEpochDay, isIsoDate, toEpochDay } from './dates';

describe('isIsoDate', () => {
  it('accepts real calendar days', () => {
    expect(isIsoDate('2026-01-01')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects anything that is not a real YYYY-MM-DD day', () => {
    for (const value of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-1-1', '31-01-2026', '', '2026-01-01T00:00:00Z', null, 20260101]) {
      expect(isIsoDate(value)).toBe(false);
    }
  });
});

describe('differenceInCalendarDays', () => {
  it('counts whole days, crossing months and years', () => {
    expect(differenceInCalendarDays('2026-01-31', '2026-01-01')).toBe(30);
    expect(differenceInCalendarDays('2026-01-05', '2025-12-25')).toBe(11);
    expect(differenceInCalendarDays('2026-01-01', '2026-01-01')).toBe(0);
    expect(differenceInCalendarDays('2026-01-01', '2026-01-05')).toBe(-4);
  });

  it('counts the leap day', () => {
    expect(differenceInCalendarDays('2024-03-01', '2024-02-28')).toBe(2);
    expect(differenceInCalendarDays('2025-03-01', '2025-02-28')).toBe(1);
  });

  it('is unaffected by daylight-saving shifts elsewhere in the world', () => {
    // The US spring-forward weekend; a naive local-time subtraction returns 0.98 days.
    expect(differenceInCalendarDays('2026-03-09', '2026-03-08')).toBe(1);
  });

  it('throws on a malformed date', () => {
    try {
      differenceInCalendarDays('2026-01-01', 'yesterday');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(LedgerError);
      expect((error as LedgerError).code).toBe(ERROR_CODES.INVALID_DATE);
    }
  });
});

describe('epoch day round trip', () => {
  it('round-trips every date it parses', () => {
    for (const value of ['1970-01-01', '2026-07-30', '2099-12-31', '0001-01-01']) {
      expect(fromEpochDay(toEpochDay(value))).toBe(value);
    }
  });

  it('does not remap two-digit years into the 1900s', () => {
    expect(fromEpochDay(toEpochDay('0099-06-15'))).toBe('0099-06-15');
  });
});

describe('compareIsoDates and addDays', () => {
  it('orders dates', () => {
    expect(compareIsoDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareIsoDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareIsoDates('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('adds and subtracts days across boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
});
