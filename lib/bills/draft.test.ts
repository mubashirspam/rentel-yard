/**
 * The billing arithmetic, checked against hand calculations.
 *
 * The property every one of these is really testing: **each unit is charged for
 * every day it was out, exactly once, across all the bills that ever mention
 * it.** A yard that double-bills a month loses a customer; one that skips a
 * month loses the money quietly, which is worse.
 */

import { describe, expect, it } from 'vitest';

import { accrue, DEFAULT_BILLING_CONFIG, type Movement } from '../accrual';
import { buildBillDraft, defaultBillPeriod, type BillAdjustmentDraft } from './draft';

const JACK = 'item-jack';
const SPAN = 'item-span';
const RATE_JACK = 200; // ₹2.00 per day
const RATE_SPAN = 400; // ₹4.00 per day

const ITEM_NAMES = { [JACK]: 'Jack 3.0m', [SPAN]: 'Span 12ft' };

/** No minimum-days floor, so the day arithmetic is visible on its own. */
const CONFIG = { ...DEFAULT_BILLING_CONFIG, minimum_days: 0 };

function issue(id: string, itemId: string, qty: number, movedAt: string, rate: number): Movement {
  return {
    id,
    itemId,
    type: 'ISSUE',
    qty,
    movedAt,
    rateSnapshot: rate,
    replacementSnapshot: 45_000,
    createdAt: `${movedAt}T09:00:00.000Z`,
  };
}

function returns(
  id: string,
  itemId: string,
  qty: number,
  movedAt: string,
  type: 'RETURN' | 'RETURN_DAMAGED' | 'LOST' = 'RETURN',
): Movement {
  return {
    id,
    itemId,
    type,
    qty,
    movedAt,
    rateSnapshot: 0,
    replacementSnapshot: 45_000,
    createdAt: `${movedAt}T09:00:00.000Z`,
  };
}

function draft(
  movements: Movement[],
  periodFrom: string,
  periodTo: string,
  options: { first?: boolean; adjustments?: BillAdjustmentDraft[] } = {},
) {
  const priorTo = previousDay(periodFrom);

  return buildBillDraft({
    current: accrue(movements, CONFIG, periodTo),
    prior: options.first ? null : accrue(movements, CONFIG, priorTo),
    adjustments: options.adjustments ?? [],
    itemNames: ITEM_NAMES,
    periodFrom,
    periodTo,
    config: CONFIG,
  });
}

function previousDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

describe('a first bill', () => {
  it('charges the whole run of every lot', () => {
    // 100 jacks out on 01-Jun, still out on 30-Jun.
    // inclusive_start: 01-Jun → 30-Jun is 29 days. 100 × 29 × ₹2 = ₹5,800.
    const bill = draft([issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK)], '2026-06-01', '2026-06-30', {
      first: true,
    });

    expect(bill.lines).toHaveLength(1);
    expect(bill.lines[0]).toMatchObject({
      itemName: 'Jack 3.0m',
      qty: 100,
      from: '2026-06-01',
      to: null,
      days: 29,
      daysBilledEarlier: 0,
      amount: 580_000,
    });
    expect(bill.rentTotal).toBe(580_000);
    expect(bill.grandTotal).toBe(580_000);
  });

  it('splits a lot returned in parts into one line per return', () => {
    const movements = [
      issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK),
      returns('r-1', JACK, 60, '2026-06-11'),
    ];

    // 60 units 01-Jun → 11-Jun = 10 days → 60 × 10 × ₹2 = ₹1,200
    // 40 units still out to 30-Jun = 29 days → 40 × 29 × ₹2 = ₹2,320
    const bill = draft(movements, '2026-06-01', '2026-06-30', { first: true });

    expect(bill.lines.map((line) => [line.qty, line.days, line.amount])).toEqual([
      [60, 10, 120_000],
      [40, 29, 232_000],
    ]);
    expect(bill.rentTotal).toBe(352_000);
  });
});

describe('a second bill', () => {
  const movements = [issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK)];

  it('charges only the days inside its own period', () => {
    // June billed 01-Jun → 30-Jun (29 days). July adds 30-Jun → 31-Jul (31 days).
    const july = draft(movements, '2026-07-01', '2026-07-31');

    expect(july.lines).toHaveLength(1);
    expect(july.lines[0]).toMatchObject({ qty: 100, days: 31, daysBilledEarlier: 29 });
    expect(july.rentTotal).toBe(100 * 31 * RATE_JACK);
    expect(july.billedEarlier).toBe(100 * 29 * RATE_JACK);
  });

  it('adds up to one continuous run when the two periods are put together', () => {
    const june = draft(movements, '2026-06-01', '2026-06-30', { first: true });
    const july = draft(movements, '2026-07-01', '2026-07-31');

    // 01-Jun → 31-Jul inclusive_start is 60 days. 100 × 60 × ₹2 = ₹12,000.
    expect(june.rentTotal + july.rentTotal).toBe(100 * 60 * RATE_JACK);
    expect(accrue(movements, CONFIG, '2026-07-31').rentTotal).toBe(june.rentTotal + july.rentTotal);
  });

  it('never re-bills a return that the previous period settled', () => {
    const withReturn = [...movements, returns('r-1', JACK, 100, '2026-06-20')];

    const june = draft(withReturn, '2026-06-01', '2026-06-30', { first: true });
    const july = draft(withReturn, '2026-07-01', '2026-07-31');

    expect(june.rentTotal).toBe(100 * 19 * RATE_JACK); // 01-Jun → 20-Jun
    expect(july.lines).toEqual([]);
    expect(july.rentTotal).toBe(0);
  });

  it('charges a return made during the period for its remaining days only', () => {
    const withReturn = [
      issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK),
      returns('r-1', JACK, 60, '2026-07-11'),
    ];

    const june = draft(withReturn, '2026-06-01', '2026-06-30', { first: true });
    const july = draft(withReturn, '2026-07-01', '2026-07-31');

    // June: everything still out — 100 × 29 days.
    expect(june.rentTotal).toBe(100 * 29 * RATE_JACK);

    // July: 60 units ran to 11-Jul (40 days total, 29 already billed → 11),
    // 40 units still out to 31-Jul (60 days total, 29 billed → 31).
    expect(july.lines.map((line) => [line.qty, line.days, line.to])).toEqual([
      [60, 11, '2026-07-11'],
      [40, 31, null],
    ]);
    expect(july.rentTotal).toBe((60 * 11 + 40 * 31) * RATE_JACK);

    // And the two together are exactly the account's whole accrual.
    expect(june.rentTotal + july.rentTotal).toBe(
      accrue(withReturn, CONFIG, '2026-07-31').rentTotal,
    );
  });

  it('bills a lot issued mid-period from its own issue date', () => {
    const later = [
      issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK),
      issue('lot-2', SPAN, 40, '2026-07-10', RATE_SPAN),
    ];

    const july = draft(later, '2026-07-01', '2026-07-31');
    const span = july.lines.find((line) => line.itemId === SPAN)!;

    expect(span).toMatchObject({ qty: 40, from: '2026-07-10', days: 21, daysBilledEarlier: 0 });
    expect(span.amount).toBe(40 * 21 * RATE_SPAN);
  });
});

describe('the minimum-days floor across periods', () => {
  // The floor is off by default now (the yard charges days held), so this
  // block states the 15 days it is about.
  const CONFIG_MIN = { ...DEFAULT_BILLING_CONFIG, minimum_days: 15 };

  function draftWithMinimum(movements: Movement[], from: string, to: string, first = false) {
    return buildBillDraft({
      current: accrue(movements, CONFIG_MIN, to),
      prior: first ? null : accrue(movements, CONFIG_MIN, previousDay(from)),
      adjustments: [],
      itemNames: ITEM_NAMES,
      periodFrom: from,
      periodTo: to,
      config: CONFIG_MIN,
    });
  }

  it('charges nothing further when a lot comes back inside its billed minimum', () => {
    const movements = [
      issue('lot-1', JACK, 10, '2026-06-25', RATE_JACK),
      returns('r-1', JACK, 10, '2026-07-02'),
    ];

    // June bills the 15-day minimum on 10 jacks: 10 × 15 × ₹2 = ₹300.
    const june = draftWithMinimum(movements, '2026-06-01', '2026-06-30', true);
    expect(june.rentTotal).toBe(10 * 15 * RATE_JACK);

    // The lot was out 7 days in all, already covered by that minimum, so July
    // has nothing to charge — not a negative line, and not a repeat.
    const july = draftWithMinimum(movements, '2026-07-01', '2026-07-31');
    expect(july.lines).toEqual([]);
    expect(july.rentTotal).toBe(0);
  });
});

describe('damages and adjustments', () => {
  it('bills damage once, in the period the ledger first saw it', () => {
    const movements = [
      issue('lot-1', JACK, 100, '2026-06-01', RATE_JACK),
      returns('r-1', JACK, 4, '2026-07-05', 'RETURN_DAMAGED'),
    ];

    const june = draft(movements, '2026-06-01', '2026-06-30', { first: true });
    const july = draft(movements, '2026-07-01', '2026-07-31');
    const august = draft(movements, '2026-08-01', '2026-08-31');

    expect(june.damageTotal).toBe(0);
    expect(july.damageTotal).toBe(4 * 45_000); // ₹1,800
    expect(july.damageLines[0].itemName).toBe('Jack 3.0m');
    expect(august.damageTotal).toBe(0);
  });

  it('takes only the adjustments applied inside the period', () => {
    const adjustments: BillAdjustmentDraft[] = [
      { id: 'a-1', kind: 'charge', amount: 150_000, reason: 'Transport', appliedOn: '2026-06-15' },
      { id: 'a-2', kind: 'credit', amount: 50_000, reason: 'Goodwill', appliedOn: '2026-06-20' },
      { id: 'a-3', kind: 'charge', amount: 999_00, reason: 'Next month', appliedOn: '2026-07-02' },
    ];

    const bill = draft([issue('lot-1', JACK, 10, '2026-06-01', RATE_JACK)], '2026-06-01', '2026-06-30', {
      first: true,
      adjustments,
    });

    expect(bill.adjustments.map((a) => a.id)).toEqual(['a-1', 'a-2']);
    expect(bill.chargesTotal).toBe(150_000);
    expect(bill.creditsTotal).toBe(50_000);

    // rent + damages + charges − credits, per §09's total block.
    expect(bill.grandTotal).toBe(bill.rentTotal + 150_000 - 50_000);
  });
});

describe('default period', () => {
  it('starts at the account opening for a first bill', () => {
    expect(
      defaultBillPeriod({ openedOn: '2026-06-01', lastPeriodTo: null, today: '2026-06-30' }),
    ).toEqual({ periodFrom: '2026-06-01', periodTo: '2026-06-30' });
  });

  it('starts the day after the last bill', () => {
    expect(
      defaultBillPeriod({ openedOn: '2026-06-01', lastPeriodTo: '2026-06-30', today: '2026-07-31' }),
    ).toEqual({ periodFrom: '2026-07-01', periodTo: '2026-07-31' });
  });

  it('never offers a period that ends before it starts', () => {
    // Billed to today already, and someone opens the screen again.
    expect(
      defaultBillPeriod({ openedOn: '2026-06-01', lastPeriodTo: '2026-07-31', today: '2026-07-31' }),
    ).toEqual({ periodFrom: '2026-08-01', periodTo: '2026-08-01' });
  });
});
