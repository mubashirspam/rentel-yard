/**
 * The per-item minimum hire period.
 *
 * The yard's rule, stated by the owner: a span that goes out for one day costs
 * the same as one that goes out for five, because the lorry, the loading and
 * the unloading cost the same either way. Past the minimum, every further day
 * is charged at the daily rate as usual.
 *
 * Worked at ₹5.00/day with a five-day minimum, which is the example the rule
 * was explained with:
 *
 *     held 1 day   → ₹25    held 5 days  → ₹25
 *     held 3 days  → ₹25    held 6 days  → ₹30
 *
 * The floor lives on the item, not the yard, and is frozen onto each ISSUE at
 * the moment it leaves — so editing the item master never reprices a lot that
 * is already standing on a site. Both halves are pinned here.
 */

import { describe, expect, it } from 'vitest';

import { rupeesToPaise } from '../money';
import { DEFAULT_BILLING_CONFIG } from './config';
import { accrue } from './engine';
import type { BillingConfig, Movement } from './types';

/**
 * The org-level floor stays at zero throughout. Every number below therefore
 * comes from the item's own snapshot — if the engine ever fell back to the
 * config, these tests would all collapse to "days actually held".
 */
const CONFIG: BillingConfig = { ...DEFAULT_BILLING_CONFIG, minimum_days: 0, day_count_mode: 'inclusive_start' };

const SPAN = 'item-span';
const SHEET = 'item-sheet';

const RATE = rupeesToPaise('5.00');
const RATE_SHEET = rupeesToPaise('1.00');

let sequence = 0;

function issue(
  qty: number,
  movedAt: string,
  options: { itemId?: string; minDays?: number | null; rate?: number } = {},
): Movement {
  sequence += 1;
  return {
    id: `i${sequence}`,
    itemId: options.itemId ?? SPAN,
    type: 'ISSUE',
    qty,
    movedAt,
    rateSnapshot: options.rate ?? RATE,
    replacementSnapshot: 0,
    minDaysSnapshot: options.minDays === undefined ? 5 : options.minDays,
    createdAt: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  };
}

function takeBack(qty: number, movedAt: string, itemId = SPAN): Movement {
  sequence += 1;
  return {
    id: `r${sequence}`,
    itemId,
    type: 'RETURN',
    qty,
    movedAt,
    rateSnapshot: RATE,
    replacementSnapshot: 0,
    createdAt: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  };
}

describe('the owner’s worked example: ₹5 a day, five-day minimum', () => {
  // 01-Jun → 02-Jun is one day under inclusive_start, and so on up the table.
  const cases: Array<[label: string, returnedOn: string, days: number, rupees: number]> = [
    ['held one day', '2026-06-02', 5, 25],
    ['held two days', '2026-06-03', 5, 25],
    ['held three days', '2026-06-04', 5, 25],
    ['held four days', '2026-06-05', 5, 25],
    ['held exactly the minimum', '2026-06-06', 5, 25],
    ['held one day past it', '2026-06-07', 6, 30],
    ['held two days past it', '2026-06-08', 7, 35],
  ];

  for (const [label, returnedOn, days, amount] of cases) {
    it(`${label} bills ${days} days — ₹${amount}`, () => {
      const result = accrue([issue(1, '2026-06-01'), takeBack(1, returnedOn)], CONFIG, '2026-06-30');

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].days).toBe(days);
      expect(result.lines[0].minimumDays).toBe(5);
      expect(result.rentTotal).toBe(rupeesToPaise(String(amount)));
    });
  }

  it('multiplies by quantity, not just by days', () => {
    // 40 spans back the next morning: 40 × 5 × ₹5 = ₹1,000.
    const result = accrue(
      [issue(40, '2026-06-01'), takeBack(40, '2026-06-02')],
      CONFIG,
      '2026-06-30',
    );

    expect(result.rentTotal).toBe(rupeesToPaise('1000'));
  });

  it('reports the days actually held alongside the days charged', () => {
    // Both figures are on the line because a bill has to be arguable: the
    // contractor's "we had it one day" and the yard's "five is the minimum"
    // are each true, and the invoice prints both.
    const result = accrue([issue(1, '2026-06-01'), takeBack(1, '2026-06-02')], CONFIG, '2026-06-30');

    expect(result.lines[0].rawDays).toBe(1);
    expect(result.lines[0].days).toBe(5);
    expect(result.lines[0].minimumApplied).toBe(true);
  });
});

describe('the floor belongs to the item', () => {
  it('bills two items on one account at their own minimums', () => {
    // A span on five days and a sheet on one, both out for a single day. The
    // whole point of moving the floor off the org: 1 × 5 × ₹5 = ₹25 for the
    // span, 1 × 1 × ₹1 = ₹1 for the sheet.
    const result = accrue(
      [
        issue(1, '2026-06-01'),
        issue(1, '2026-06-01', { itemId: SHEET, minDays: 1, rate: RATE_SHEET }),
        takeBack(1, '2026-06-02'),
        takeBack(1, '2026-06-02', SHEET),
      ],
      CONFIG,
      '2026-06-30',
    );

    const bySpan = result.lines.find((line) => line.itemId === SPAN)!;
    const bySheet = result.lines.find((line) => line.itemId === SHEET)!;

    expect(bySpan.days).toBe(5);
    expect(bySheet.days).toBe(1);
    expect(result.rentTotal).toBe(rupeesToPaise('26'));
  });

  it('a minimum of one charges the days actually held', () => {
    const result = accrue(
      [issue(1, '2026-06-01', { minDays: 1 }), takeBack(1, '2026-06-02')],
      CONFIG,
      '2026-06-30',
    );

    expect(result.lines[0].days).toBe(1);
    expect(result.lines[0].minimumApplied).toBe(false);
    expect(result.rentTotal).toBe(RATE);
  });
});

describe('the snapshot is what protects a bill', () => {
  it('values two lots of one item at the minimums they left the yard under', () => {
    // The admin changed the span's minimum from 5 to 2 between the two loads.
    // The lot already on site keeps 5; only the new one gets 2. Nothing on the
    // June lot moves, which is the §02 invariant the rate snapshot already has.
    const result = accrue(
      [
        issue(1, '2026-06-01', { minDays: 5 }),
        issue(1, '2026-07-01', { minDays: 2 }),
        takeBack(1, '2026-06-02'),
        takeBack(1, '2026-07-02'),
      ],
      CONFIG,
      '2026-07-30',
    );

    const [first, second] = result.lines;

    expect(first.days).toBe(5);
    expect(second.days).toBe(2);
    expect(result.rentTotal).toBe(rupeesToPaise('35'));
  });

  it('falls back to the org rule for lots issued before the column existed', () => {
    // `min_days_snapshot` is null on every movement written before this feature
    // shipped. Backfilling a 5 would rewrite history behind issued bills, so
    // those lots keep answering to `config.minimum_days` — which is what they
    // were actually billed at.
    const legacy = accrue(
      [issue(1, '2026-06-01', { minDays: null }), takeBack(1, '2026-06-02')],
      { ...CONFIG, minimum_days: 15 },
      '2026-06-30',
    );

    expect(legacy.lines[0].days).toBe(15);
    expect(legacy.lines[0].minimumDays).toBe(15);
  });
});

describe('open lots carry the floor to the screens', () => {
  it('reports days held and days billed separately while still out', () => {
    // Day two of a five-day minimum. The account screen shows "1 day" for how
    // long it has stood and charges five, and both numbers have to be on the
    // lot or a tile ends up printing one beside the other's money.
    const result = accrue([issue(10, '2026-06-01')], CONFIG, '2026-06-02');

    const [lot] = result.openLots;

    expect(lot.daysHeld).toBe(1);
    expect(lot.minimumDays).toBe(5);
    expect(lot.billedDays).toBe(5);
    expect(lot.accruedAmount).toBe(10 * 5 * RATE);
    expect(lot.accruedAmount).toBe(result.rentTotal);
  });

  it('stops floor and calendar disagreeing once the minimum is passed', () => {
    const result = accrue([issue(10, '2026-06-01')], CONFIG, '2026-06-11');

    const [lot] = result.openLots;

    expect(lot.daysHeld).toBe(10);
    expect(lot.billedDays).toBe(10);
    expect(lot.accruedAmount).toBe(10 * 10 * RATE);
  });
});
