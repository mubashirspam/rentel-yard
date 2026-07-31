/**
 * Moving units between good, damaged and lost on a return.
 *
 * Pulled out of the screen because it is the one piece of the return sheet that
 * can be wrong in a way nobody notices: a contractor watches 42 jacks come off
 * a lorry, one is bent, and the ledger must still say 42 came back — not 43.
 *
 * The rule: **damaged and lost take from good.** Marking a unit damaged
 * re-classifies it, it does not add one. Good's own controls are what change
 * how many are coming back at all, bounded by what is out.
 */

export interface ReturnSplit {
  good: number;
  damaged: number;
  lost: number;
}

export const EMPTY_SPLIT: ReturnSplit = { good: 0, damaged: 0, lost: 0 };

export function splitTotal(split: ReturnSplit): number {
  return split.good + split.damaged + split.lost;
}

export function setSplit(
  current: ReturnSplit,
  key: keyof ReturnSplit,
  value: number,
  qtyOut: number,
): ReturnSplit {
  const wanted = Math.max(0, value);

  if (key === 'good') {
    // Bounded by what is still out once damaged and lost have taken their share.
    const room = qtyOut - current.damaged - current.lost;
    return { ...current, good: Math.min(wanted, Math.max(0, room)) };
  }

  const delta = wanted - current[key];
  // Taking from good, and never more than good has to give.
  const moved = delta > 0 ? Math.min(delta, current.good) : Math.max(delta, -current[key]);

  return { ...current, [key]: current[key] + moved, good: current.good - moved };
}
