/**
 * The twelve required test vectors from §03.5, plus the properties the rest of
 * the system leans on.
 *
 * Config throughout: minimum_days = 15, day_count_mode = inclusive_start,
 * jack rate ₹2.00/day, replacement ₹450.
 */

import { describe, expect, it } from 'vitest';

import { ERROR_CODES, LedgerError, type ErrorCode } from '../errors';
import { rupeesToPaise } from '../money';
import { DEFAULT_BILLING_CONFIG } from './config';
import { accrue, isAccountEmpty, outstandingFor } from './engine';
import type { BillingConfig, Movement } from './types';

// §03.5's vectors are specified against a 15-day minimum, so they state it
// explicitly. The shipped default is 0 — the yard charges days actually held —
// but the floor still has to work for any yard that wants one.
const CONFIG: BillingConfig = { ...DEFAULT_BILLING_CONFIG, minimum_days: 15 };

const JACK = 'item-jack';
const SHEET = 'item-sheet';

const RATE_JACK = rupeesToPaise('2.00');
const RATE_SHEET = rupeesToPaise('1.00');
const REPLACEMENT_JACK = rupeesToPaise('450');

const rupees = (amount: string | number) => rupeesToPaise(amount);

let sequence = 0;

type MovementDraft = Partial<Movement> & Pick<Movement, 'type' | 'qty' | 'movedAt'>;

function movement(draft: MovementDraft): Movement {
  sequence += 1;
  return {
    id: `m${sequence}`,
    itemId: JACK,
    rateSnapshot: RATE_JACK,
    replacementSnapshot: REPLACEMENT_JACK,
    createdAt: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    ...draft,
  };
}

const issue = (qty: number, movedAt: string, extra: Partial<Movement> = {}) =>
  movement({ type: 'ISSUE', qty, movedAt, ...extra });

const takeBack = (qty: number, movedAt: string, extra: Partial<Movement> = {}) =>
  movement({ type: 'RETURN', qty, movedAt, ...extra });

const damaged = (qty: number, movedAt: string, extra: Partial<Movement> = {}) =>
  movement({ type: 'RETURN_DAMAGED', qty, movedAt, ...extra });

const lost = (qty: number, movedAt: string, extra: Partial<Movement> = {}) =>
  movement({ type: 'LOST', qty, movedAt, ...extra });

/** Asserts `fn` throws a `LedgerError` with `code`, and returns it for further checks. */
function expectLedgerError(fn: () => unknown, code: ErrorCode): LedgerError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(LedgerError);
    expect((error as LedgerError).code).toBe(code);
    return error as LedgerError;
  }
  throw new Error(`Expected a ${code} error, but nothing was thrown.`);
}

const reversalOf = (target: Movement, movedAt: string) =>
  movement({
    type: 'REVERSAL',
    qty: target.qty,
    movedAt,
    itemId: target.itemId,
    reversesId: target.id,
  });

describe('§03.5 required test vectors', () => {
  it('1 — a full-term rental bills every calendar day held', () => {
    const result = accrue([issue(10, '2026-01-01'), takeBack(10, '2026-01-31')], CONFIG, '2026-01-31');

    // 30 days × 10 × ₹2
    expect(result.rentTotal).toBe(rupees(600));
    expect(outstandingFor(result, JACK)).toBe(0);
    expect(isAccountEmpty(result)).toBe(true);
  });

  it('2 — an early return is floored at the minimum rental period', () => {
    const result = accrue([issue(10, '2026-01-01'), takeBack(10, '2026-01-06')], CONFIG, '2026-01-31');

    // Held 5 days, billed 15 × 10 × ₹2
    expect(result.rentTotal).toBe(rupees(300));
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toMatchObject({ rawDays: 5, days: 15, minimumApplied: true });
  });

  it('3 — a partial return closes part of the lot and the rest keeps accruing', () => {
    const result = accrue([issue(10, '2026-01-01'), takeBack(4, '2026-01-21')], CONFIG, '2026-01-31');

    // 4 × 20 × ₹2 = ₹160, plus 6 × 30 × ₹2 = ₹360
    expect(result.rentTotal).toBe(rupees(520));
    expect(outstandingFor(result, JACK)).toBe(6);
    expect(result.lines.map((line) => line.amount)).toEqual([rupees(160), rupees(360)]);
  });

  it('4 — returns consume the oldest lot first', () => {
    const first = issue(10, '2026-01-01');
    const second = issue(10, '2026-01-11');
    const result = accrue([first, second, takeBack(10, '2026-01-21')], CONFIG, '2026-01-31');

    // First lot closes at 20 days = ₹400; second is still open at 20 days = ₹400
    expect(result.rentTotal).toBe(rupees(800));
    expect(outstandingFor(result, JACK)).toBe(10);

    const closed = result.lines.find((line) => line.to !== null);
    expect(closed?.lotId).toBe(first.id);
    expect(result.openLots).toEqual([
      expect.objectContaining({ lotId: second.id, qty: 10, from: '2026-01-11' }),
    ]);
  });

  it('5 — a damaged return stops rent on those units and charges replacement', () => {
    const result = accrue([issue(10, '2026-01-01'), damaged(5, '2026-01-11')], CONFIG, '2026-01-31');

    // Rent: 5 units floored to 15 days = ₹150, plus 5 still out for 30 days = ₹300
    expect(result.lines[0]).toMatchObject({ qty: 5, days: 15, amount: rupees(150) });
    expect(result.rentTotal).toBe(rupees(450));

    // Damage: 5 × ₹450
    expect(result.damageTotal).toBe(rupees(2250));
    expect(outstandingFor(result, JACK)).toBe(5);
  });

  it('6 — a return larger than the outstanding quantity is rejected outright', () => {
    const movements = [issue(10, '2026-01-01'), takeBack(12, '2026-01-11')];

    const error = expectLedgerError(
      () => accrue(movements, CONFIG, '2026-01-31'),
      ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING,
    );
    expect(error.context).toMatchObject({ outstanding: 10, attempted: 12 });
    expect(error.message).toBe('Only 10 units are out on this account — check the quantity.');

    // Outstanding is unchanged, because nothing was committed.
    const before = accrue([movements[0]], CONFIG, '2026-01-31');
    expect(outstandingFor(before, JACK)).toBe(10);
  });

  it('7 — a reversed issue leaves no rent and no outstanding quantity', () => {
    const original = issue(10, '2026-01-01');
    const result = accrue([original, reversalOf(original, '2026-01-03')], CONFIG, '2026-01-31');

    expect(result.rentTotal).toBe(0);
    expect(result.damageTotal).toBe(0);
    expect(outstandingFor(result, JACK)).toBe(0);
    expect(result.lines).toEqual([]);
    expect(result.openLots).toEqual([]);
  });

  it('8 — the rate frozen on the issue wins over a later master-rate change', () => {
    // The master rate moving to ₹3 never reaches the engine: the lot carries
    // the ₹2 snapshot taken when the equipment left the yard.
    const result = accrue(
      [issue(10, '2026-01-01', { rateSnapshot: RATE_JACK }), takeBack(10, '2026-01-31')],
      CONFIG,
      '2026-01-31',
    );

    expect(result.rentTotal).toBe(rupees(600));
    expect(result.rentTotal).not.toBe(rupees(900));
  });

  it('9 — lots never cross item boundaries', () => {
    const jackLot = issue(10, '2026-01-01');
    const sheetLot = issue(200, '2026-01-01', { itemId: SHEET, rateSnapshot: RATE_SHEET });
    const result = accrue(
      [jackLot, sheetLot, takeBack(200, '2026-01-11', { itemId: SHEET, rateSnapshot: RATE_SHEET })],
      CONFIG,
      '2026-01-31',
    );

    expect(outstandingFor(result, JACK)).toBe(10);
    expect(outstandingFor(result, SHEET)).toBe(0);

    // The jack lot is untouched and still open.
    expect(result.openLots).toEqual([
      expect.objectContaining({ itemId: JACK, lotId: jackLot.id, qty: 10 }),
    ]);

    // Sheets: 200 units floored to 15 days × ₹1. Jacks: 10 × 30 days × ₹2.
    expect(result.rentTotal).toBe(rupees(3000) + rupees(600));
  });

  it('10 — one lot returned in three parts bills each slice on its own days', () => {
    const result = accrue(
      [
        issue(10, '2026-01-01'),
        takeBack(3, '2026-01-11'),
        takeBack(3, '2026-01-21'),
        takeBack(4, '2026-01-31'),
      ],
      CONFIG,
      '2026-01-31',
    );

    // 3 × 15 (minimum) + 3 × 20 + 4 × 30 = 45 + 60 + 120 = 225 unit-days × ₹2.
    //
    // NOTE: §03.5 states ₹540 for this vector, arriving there via
    // "3×15(min) + 3×20 + 4×30 = 90+60+120 = 270". The first term is
    // miscomputed — 3 × 15 is 45, not 90 — so the correct total is ₹450.
    // Flagged to the yard owner; the arithmetic is what is encoded here.
    expect(result.lines.map((line) => line.amount)).toEqual([rupees(90), rupees(120), rupees(240)]);
    expect(result.rentTotal).toBe(rupees(450));
    expect(outstandingFor(result, JACK)).toBe(0);
    expect(isAccountEmpty(result)).toBe(true);
  });

  it('11 — a back-dated lot is consumed first, whatever order it was entered in', () => {
    const january = issue(10, '2026-01-01', { createdAt: '2026-01-01T09:00:00.000Z' });
    // Entered days later, but dated before the January lot.
    const december = issue(10, '2025-12-25', { createdAt: '2026-01-04T09:00:00.000Z' });

    const result = accrue([january, december, takeBack(10, '2026-01-05')], CONFIG, '2026-01-31');

    const closed = result.lines.find((line) => line.to !== null);
    expect(closed?.lotId).toBe(december.id);
    expect(closed?.from).toBe('2025-12-25');
    // Held 11 days, floored to 15 × 10 × ₹2 = ₹300.
    expect(closed?.amount).toBe(rupees(300));

    // The January lot stays open: 30 days × 10 × ₹2 = ₹600.
    expect(result.openLots).toEqual([expect.objectContaining({ lotId: january.id, qty: 10 })]);
    expect(result.rentTotal).toBe(rupees(900));
  });

  it('12 — an empty ledger produces zeroes and does not throw', () => {
    const result = accrue([], CONFIG, '2026-01-31');

    expect(result).toMatchObject({
      lines: [],
      damageLines: [],
      rentTotal: 0,
      damageTotal: 0,
      outstanding: {},
      lostByItem: {},
      openLots: [],
    });
    expect(isAccountEmpty(result)).toBe(true);
  });
});

describe('determinism', () => {
  it('produces identical output regardless of input order', () => {
    const movements = [
      issue(10, '2026-01-01'),
      issue(5, '2026-01-11'),
      takeBack(4, '2026-01-21'),
      damaged(2, '2026-01-25'),
    ];

    const forwards = accrue(movements, CONFIG, '2026-01-31');
    const backwards = accrue([...movements].reverse(), CONFIG, '2026-01-31');

    expect(backwards).toEqual(forwards);
  });
});

describe('day counting', () => {
  it('bills the issue day but not the return day under inclusive_start', () => {
    const result = accrue([issue(1, '2026-01-01'), takeBack(1, '2026-01-02')], { ...CONFIG, minimum_days: 0 }, '2026-01-31');
    expect(result.lines[0].days).toBe(1);
  });

  it('bills a same-day issue and return as one day, never zero', () => {
    const result = accrue([issue(1, '2026-01-01'), takeBack(1, '2026-01-01')], { ...CONFIG, minimum_days: 0 }, '2026-01-31');
    expect(result.lines[0].days).toBe(1);
  });

  it('bills both ends under inclusive_both', () => {
    const config: BillingConfig = { ...CONFIG, minimum_days: 0, day_count_mode: 'inclusive_both' };
    const result = accrue([issue(1, '2026-01-01'), takeBack(1, '2026-01-02')], config, '2026-01-31');
    expect(result.lines[0].days).toBe(2);
  });
});

describe('damage and loss', () => {
  it('charges a manual amount in place of the replacement rate', () => {
    const result = accrue(
      [issue(10, '2026-01-01'), damaged(2, '2026-01-11', { manualCharge: rupees(120) })],
      CONFIG,
      '2026-01-31',
    );

    expect(result.damageTotal).toBe(rupees(240));
    expect(result.damageLines[0]).toMatchObject({ manual: true, unitCharge: rupees(120) });
  });

  it('records lost units separately so stock can be written down', () => {
    const result = accrue([issue(10, '2026-01-01'), lost(3, '2026-01-11')], CONFIG, '2026-01-31');

    expect(result.lostByItem).toEqual({ [JACK]: 3 });
    expect(result.damageTotal).toBe(rupees(1350));
    expect(outstandingFor(result, JACK)).toBe(7);
  });

  it('stops rent on lost units at the date they were written off', () => {
    const result = accrue([issue(10, '2026-01-01'), lost(10, '2026-01-21')], CONFIG, '2026-01-31');

    // 20 days, not 30 — the units stopped accruing when they were declared lost.
    expect(result.rentTotal).toBe(rupees(400));
  });
});

describe('reversals', () => {
  it('reopens a lot when the return that closed it is reversed', () => {
    const opened = issue(10, '2026-01-01');
    const returned = takeBack(10, '2026-01-11');
    const result = accrue([opened, returned, reversalOf(returned, '2026-01-12')], CONFIG, '2026-01-31');

    expect(outstandingFor(result, JACK)).toBe(10);
    expect(result.rentTotal).toBe(rupees(600));
  });

  it('rejects a reversal that does not name its target', () => {
    const movements = [
      issue(10, '2026-01-01'),
      movement({ type: 'REVERSAL', qty: 10, movedAt: '2026-01-03' }),
    ];

    expectLedgerError(() => accrue(movements, CONFIG, '2026-01-31'), ERROR_CODES.REVERSAL_MISSING_TARGET);
  });
});

describe('valuation date', () => {
  it('ignores movements dated after asOf', () => {
    const result = accrue(
      [issue(10, '2026-01-01'), takeBack(10, '2026-02-15')],
      CONFIG,
      '2026-01-31',
    );

    // As of 31 January the equipment is still out.
    expect(outstandingFor(result, JACK)).toBe(10);
    expect(result.rentTotal).toBe(rupees(600));
  });

  it('rejects a malformed valuation date', () => {
    expectLedgerError(() => accrue([], CONFIG, '31-01-2026'), ERROR_CODES.INVALID_DATE);
    expectLedgerError(() => accrue([], CONFIG, '2026-02-30'), ERROR_CODES.INVALID_DATE);
  });
});

describe('input validation', () => {
  it('rejects a zero or fractional quantity', () => {
    expectLedgerError(() => accrue([issue(0, '2026-01-01')], CONFIG, '2026-01-31'), ERROR_CODES.INVALID_QUANTITY);
    expectLedgerError(() => accrue([issue(2.5, '2026-01-01')], CONFIG, '2026-01-31'), ERROR_CODES.INVALID_QUANTITY);
  });

  it('rejects a billing config with a bad minimum', () => {
    expectLedgerError(
      () => accrue([], { ...CONFIG, minimum_days: -1 }, '2026-01-31'),
      ERROR_CODES.INVALID_CONFIG,
    );
  });
});
