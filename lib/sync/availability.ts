/**
 * Availability, computed on the device.
 *
 * `v_item_stock` is a database view and cannot travel to a phone, so the same
 * arithmetic lives here — and that duplication is the risk. If this drifts from
 * the view, an admin offline sees one number and the same admin online sees
 * another, with no way to tell which is wrong.
 *
 * The rules, from §02 and migration 0001:
 *
 *   qty_out       = ISSUE − RETURN − RETURN_DAMAGED − LOST
 *   qty_lost      = LOST
 *   qty_available = owned − lost − out
 *
 * REVERSAL rows, and anything a reversal cancels, are excluded. Availability is
 * allowed to go negative rather than clamping at zero: §07.4 says two devices
 * overselling offline should both be accepted, because the equipment really did
 * leave the yard, and an admin needs to see the problem.
 *
 * Pure, so it can be tested without a browser.
 */

export interface AvailabilityMovement {
  id: string;
  itemId: string;
  type: 'ISSUE' | 'RETURN' | 'RETURN_DAMAGED' | 'LOST' | 'REVERSAL';
  qty: number;
  reversesId?: string | null;
}

export interface AvailabilityTotals {
  qtyOut: number;
  qtyLost: number;
}

export function availabilityByItem(
  movements: readonly AvailabilityMovement[],
): Map<string, AvailabilityTotals> {
  const reversed = new Set<string>();
  for (const movement of movements) {
    if (movement.type === 'REVERSAL' && movement.reversesId) reversed.add(movement.reversesId);
  }

  const totals = new Map<string, AvailabilityTotals>();

  for (const movement of movements) {
    if (movement.type === 'REVERSAL' || reversed.has(movement.id)) continue;

    const current = totals.get(movement.itemId) ?? { qtyOut: 0, qtyLost: 0 };

    current.qtyOut += movement.type === 'ISSUE' ? movement.qty : -movement.qty;
    if (movement.type === 'LOST') current.qtyLost += movement.qty;

    totals.set(movement.itemId, current);
  }

  return totals;
}

export function qtyAvailable(qtyOwned: number, totals: AvailabilityTotals): number {
  return qtyOwned - totals.qtyLost - totals.qtyOut;
}

/** Under a tenth of what the yard owns. Matches `listStock`'s definition. */
export function isLowStock(qtyOwned: number, available: number): boolean {
  return available >= 0 && qtyOwned > 0 && available * 10 < qtyOwned;
}
