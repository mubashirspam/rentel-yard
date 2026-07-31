/**
 * The invariant: the lorry brought what the lorry brought.
 *
 * Marking a unit damaged must never change how many came back — only which
 * kind they are. Get this wrong and the yard's stock quietly gains a jack every
 * time somebody taps the wrong plus.
 */

import { describe, expect, it } from 'vitest';

import { EMPTY_SPLIT, setSplit, splitTotal, type ReturnSplit } from './split';

/** 42 came back, all in good condition — the prefilled state. */
const FULL: ReturnSplit = { good: 42, damaged: 0, lost: 0 };
const OUT = 42;

describe('marking a unit damaged or lost', () => {
  it('takes it out of good rather than adding to the return', () => {
    const after = setSplit(FULL, 'damaged', 1, OUT);

    expect(after).toEqual({ good: 41, damaged: 1, lost: 0 });
    expect(splitTotal(after)).toBe(42);
  });

  it('does the same for lost', () => {
    const after = setSplit(FULL, 'lost', 1, OUT);

    expect(after).toEqual({ good: 41, damaged: 0, lost: 1 });
    expect(splitTotal(after)).toBe(42);
  });

  it('gives the unit back to good when it is unmarked', () => {
    const damaged = setSplit(FULL, 'damaged', 2, OUT);
    const undone = setSplit(damaged, 'damaged', 1, OUT);

    expect(undone).toEqual({ good: 41, damaged: 1, lost: 0 });
    expect(splitTotal(undone)).toBe(42);
  });

  it('keeps the total fixed however the three are shuffled', () => {
    let split = FULL;
    split = setSplit(split, 'damaged', 5, OUT);
    split = setSplit(split, 'lost', 3, OUT);
    split = setSplit(split, 'damaged', 2, OUT);

    expect(split).toEqual({ good: 37, damaged: 2, lost: 3 });
    expect(splitTotal(split)).toBe(42);
  });

  it('cannot take more than good has to give', () => {
    const nearlyAll = setSplit(FULL, 'damaged', 42, OUT);
    expect(nearlyAll).toEqual({ good: 0, damaged: 42, lost: 0 });

    // Nothing left in good, so lost cannot claim anything.
    const greedy = setSplit(nearlyAll, 'lost', 5, OUT);
    expect(greedy).toEqual({ good: 0, damaged: 42, lost: 0 });
    expect(splitTotal(greedy)).toBe(42);
  });

  it('never goes negative when nudged below zero', () => {
    expect(setSplit(EMPTY_SPLIT, 'damaged', -1, OUT)).toEqual(EMPTY_SPLIT);
    expect(setSplit(FULL, 'good', -5, OUT)).toEqual({ good: 0, damaged: 0, lost: 0 });
  });
});

describe('changing how many are coming back', () => {
  it('is what the good control does', () => {
    const partial = setSplit(FULL, 'good', 30, OUT);

    expect(partial).toEqual({ good: 30, damaged: 0, lost: 0 });
    expect(splitTotal(partial)).toBe(30); // 12 staying out
  });

  it('is capped at what is actually out', () => {
    expect(setSplit(FULL, 'good', 100, OUT)).toEqual({ good: 42, damaged: 0, lost: 0 });
  });

  it('leaves room for what damaged and lost already hold', () => {
    const split = setSplit(setSplit(FULL, 'damaged', 2, OUT), 'good', 100, OUT);

    // 2 are damaged, so good can only reach 40 — never 42.
    expect(split).toEqual({ good: 40, damaged: 2, lost: 0 });
    expect(splitTotal(split)).toBe(42);
  });
});
