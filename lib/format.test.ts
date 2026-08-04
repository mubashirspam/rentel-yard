/**
 * The weekday is worked out by hand (Sakamoto), so it gets checked by hand.
 *
 * The temptation is `new Date(iso).getDay()`, and the reason this file does not
 * take it is at the top of `format.ts`: a phone set to UTC turns "2026-06-01"
 * into the evening of 31 May and names the wrong day. That failure would show
 * up on exactly one screen, for some users only, on some days only — so the
 * arithmetic is pinned here instead, across the cases that break naive weekday
 * code: leap days, century years, and the January/February wrap.
 */

import { describe, expect, it } from 'vitest';

import { formatDay, formatDayFull, formatDayWeekday, formatDays } from './format';

/** The truth, from a source that is not the implementation under test. */
function weekdayFromIntl(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
  });
}

describe('formatDayWeekday', () => {
  it('names the day the yard would name', () => {
    expect(formatDayWeekday('2026-08-03')).toBe('Mon, 03 Aug');
    expect(formatDayWeekday('2026-07-31')).toBe('Fri, 31 Jul');
  });

  it.each([
    '2026-01-01',
    '2026-02-28',
    '2026-03-01',
    '2026-08-04',
    '2026-12-25',
    // Leap day, and the century that is a leap year where the naive rule says
    // it is not.
    '2024-02-29',
    '2000-02-29',
    // The year before a century that is *not* a leap year.
    '1899-12-31',
    '1900-03-01',
    '2100-03-01',
  ])('agrees with Intl for %s', (iso) => {
    expect(formatDayWeekday(iso)).toBe(`${weekdayFromIntl(iso)}, ${formatDay(iso)}`);
  });

  it('falls back to the bare date rather than inventing a weekday', () => {
    expect(formatDayWeekday('not-a-date')).toBe(formatDay('not-a-date'));
    expect(formatDayWeekday('2026-13-01')).toBe(formatDay('2026-13-01'));
  });
});

describe('the plain date formatters', () => {
  it('reads a calendar string without parsing it into a Date', () => {
    expect(formatDay('2026-06-01')).toBe('01 Jun');
    expect(formatDayFull('2026-06-01')).toBe('01 Jun 2026');
  });

  it('counts a single day in the singular', () => {
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(0)).toBe('0 days');
    expect(formatDays(20)).toBe('20 days');
  });
});
