/**
 * The rent accrual engine (§03).
 *
 * Pure, dependency-free, no I/O. It must never import a database client.
 * Same input, same output, always — the whole offline story and every dispute
 * with a contractor rests on that.
 *
 * The core idea is FIFO lot consumption (§03.2): each ISSUE opens a lot, each
 * return consumes from the oldest open lot first. Naive "outstanding × days"
 * breaks the moment a minimum-days rule exists, because you can no longer tell
 * which units went back, and the error compounds silently for months.
 */

import { LedgerError, ERROR_CODES } from '../errors';
import { assertBillingConfig } from './config';
import { assertIsoDate, compareIsoDates, differenceInCalendarDays, type IsoDate } from './dates';
import { roundLineTotal } from './rounding';
import type {
  AccrualResult,
  BillingConfig,
  DamageLine,
  ItemId,
  Movement,
  OpenLot,
  RentLine,
} from './types';

/** A lot while it is being walked. Not exported — lots are an internal device. */
interface WorkingLot {
  id: string;
  itemId: ItemId;
  from: IsoDate;
  rate: number;
  remaining: number;
}

/**
 * Days billed between two dates, before the minimum-days floor (§03.2).
 *
 * `inclusive_start` bills the issue day but not the return day, so a same-day
 * issue and return is one day, not zero. `inclusive_both` bills both ends.
 */
export function dayCount(from: IsoDate, to: IsoDate, config: BillingConfig): number {
  const raw = differenceInCalendarDays(to, from);
  return config.day_count_mode === 'inclusive_both' ? raw + 1 : Math.max(raw, 1);
}

/**
 * Replay an account's movements and value them as of `asOf`.
 *
 * @param movements Every movement on the account, in any order.
 * @param config    The org's §03.1 billing configuration.
 * @param asOf      Valuation date. Open lots accrue up to and including this.
 *
 * @throws {LedgerError} `RETURN_EXCEEDS_OUTSTANDING` when a return would drive
 *   an item's outstanding quantity below zero (§02 invariant). Nothing is
 *   committed — the caller's outstanding stays as it was.
 */
export function accrue(
  movements: readonly Movement[],
  config: BillingConfig,
  asOf: IsoDate,
): AccrualResult {
  assertIsoDate(asOf, 'asOf');
  const cfg = assertBillingConfig(config);

  const active = selectActive(movements, asOf);

  const lines: RentLine[] = [];
  const damageLines: DamageLine[] = [];
  const openLots: OpenLot[] = [];
  const outstanding: Record<ItemId, number> = {};
  const lostByItem: Record<ItemId, number> = {};

  // Lots never cross item boundaries (§03.2 step 3): a sheet coming back must
  // not close a jack lot.
  for (const [itemId, itemMovements] of groupByItem(active)) {
    const lots: WorkingLot[] = [];

    for (const movement of itemMovements) {
      if (movement.type === 'ISSUE') {
        lots.push({
          id: movement.id,
          itemId,
          from: movement.movedAt,
          rate: movement.rateSnapshot,
          remaining: movement.qty,
        });
        continue;
      }

      // Check the whole batch fits before mutating any lot, so a rejected
      // return leaves the replay untouched.
      const available = lots.reduce((sum, lot) => sum + lot.remaining, 0);
      if (movement.qty > available) {
        throw new LedgerError(
          ERROR_CODES.RETURN_EXCEEDS_OUTSTANDING,
          available === 0
            ? 'Nothing is out on this account for that item — check the quantity.'
            : `Only ${available} ${available === 1 ? 'unit is' : 'units are'} out on this account — check the quantity.`,
          {
            field: 'qty',
            context: {
              itemId,
              movementId: movement.id,
              outstanding: available,
              attempted: movement.qty,
            },
          },
        );
      }

      let unconsumed = movement.qty;
      for (const lot of lots) {
        if (unconsumed === 0) break;
        if (lot.remaining === 0) continue;

        const slice = Math.min(lot.remaining, unconsumed);
        lot.remaining -= slice;
        unconsumed -= slice;

        lines.push(billSlice(lot, slice, movement.movedAt, cfg));
      }

      if (movement.type === 'RETURN_DAMAGED' || movement.type === 'LOST') {
        damageLines.push(chargeDamage(movement, cfg));
      }

      if (movement.type === 'LOST') {
        lostByItem[itemId] = (lostByItem[itemId] ?? 0) + movement.qty;
      }
    }

    // Anything still out accrues up to the valuation date (§03.2 step 5).
    let stillOut = 0;
    for (const lot of lots) {
      if (lot.remaining === 0) continue;
      stillOut += lot.remaining;

      const line = billSlice(lot, lot.remaining, null, cfg, asOf);
      lines.push(line);
      openLots.push({
        itemId,
        lotId: lot.id,
        qty: lot.remaining,
        from: lot.from,
        daysHeld: line.rawDays,
        ratePerDay: lot.rate,
        accruedAmount: line.amount,
      });
    }

    outstanding[itemId] = stillOut;
  }

  return {
    lines,
    damageLines,
    rentTotal: lines.reduce((sum, line) => sum + line.amount, 0),
    damageTotal: damageLines.reduce((sum, line) => sum + line.amount, 0),
    outstanding,
    lostByItem,
    openLots,
    asOf,
  };
}

/** Units of `itemId` still out, or 0 when the item never appears. */
export function outstandingFor(result: AccrualResult, itemId: ItemId): number {
  return result.outstanding[itemId] ?? 0;
}

/** True when every item on the account is back — the §02 close precondition. */
export function isAccountEmpty(result: AccrualResult): boolean {
  return Object.values(result.outstanding).every((qty) => qty === 0);
}

/**
 * Drop reversed movements and anything dated after the valuation date, then
 * order what remains deterministically (§03.2 steps 1–2).
 */
function selectActive(movements: readonly Movement[], asOf: IsoDate): Movement[] {
  const reversedIds = new Set<string>();

  for (const movement of movements) {
    if (movement.type !== 'REVERSAL') continue;
    if (!movement.reversesId) {
      throw new LedgerError(
        ERROR_CODES.REVERSAL_MISSING_TARGET,
        'This reversal does not say which movement it cancels.',
        { field: 'reversesId', context: { movementId: movement.id } },
      );
    }
    // A reversal cancels its target outright, so it applies whatever its own
    // date is relative to `asOf` — the original movement never happened.
    reversedIds.add(movement.reversesId);
  }

  const active: Movement[] = [];

  for (const movement of movements) {
    if (movement.type === 'REVERSAL' || reversedIds.has(movement.id)) continue;

    assertIsoDate(movement.movedAt, 'movedAt');
    if (compareIsoDates(movement.movedAt, asOf) > 0) continue;

    if (!Number.isInteger(movement.qty) || movement.qty <= 0) {
      throw new LedgerError(ERROR_CODES.INVALID_QUANTITY, 'Quantity must be a whole number above zero.', {
        field: 'qty',
        context: { movementId: movement.id, qty: movement.qty },
      });
    }

    if (
      movement.type !== 'ISSUE' &&
      movement.type !== 'RETURN' &&
      movement.type !== 'RETURN_DAMAGED' &&
      movement.type !== 'LOST'
    ) {
      throw new LedgerError(
        ERROR_CODES.UNKNOWN_MOVEMENT_TYPE,
        `Movement type "${String(movement.type)}" is not recognised.`,
        { field: 'type', context: { movementId: movement.id, type: movement.type } },
      );
    }

    active.push(movement);
  }

  return active.sort(byLedgerOrder);
}

/**
 * Sort by (movedAt asc, createdAt asc) per §03.2. Back-dated entries therefore
 * slot into place by their movement date, not their entry date, so a lot
 * recorded late is still consumed in the right order (§03.5 vector 11).
 */
function byLedgerOrder(a: Movement, b: Movement): number {
  const byDate = compareIsoDates(a.movedAt, b.movedAt);
  if (byDate !== 0) return byDate;

  const byCreated = (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  if (byCreated !== 0) return byCreated;

  // Spec leaves this tie open. Opening a lot before consuming it is the only
  // reading that can succeed, so prefer it.
  if (a.type !== b.type) {
    if (a.type === 'ISSUE') return -1;
    if (b.type === 'ISSUE') return 1;
  }

  return a.id.localeCompare(b.id);
}

function groupByItem(movements: readonly Movement[]): Map<ItemId, Movement[]> {
  const groups = new Map<ItemId, Movement[]>();
  for (const movement of movements) {
    const existing = groups.get(movement.itemId);
    if (existing) existing.push(movement);
    else groups.set(movement.itemId, [movement]);
  }
  return groups;
}

/**
 * Value one FIFO slice. `closedOn` is the return date, or `null` when the
 * slice is still out and should accrue to `asOf`.
 */
function billSlice(
  lot: WorkingLot,
  qty: number,
  closedOn: IsoDate | null,
  config: BillingConfig,
  asOf?: IsoDate,
): RentLine {
  const through = closedOn ?? (asOf as IsoDate);
  const rawDays = dayCount(lot.from, through, config);
  // The minimum is evaluated per slice of an issue lot, so a lot returned in
  // three parts can have the floor bite on the earliest part only.
  const days = Math.max(rawDays, config.minimum_days);

  return {
    itemId: lot.itemId,
    lotId: lot.id,
    qty,
    from: lot.from,
    to: closedOn,
    through,
    days,
    rawDays,
    minimumApplied: days > rawDays,
    ratePerDay: lot.rate,
    amount: roundLineTotal(qty * days * lot.rate, config.rounding),
  };
}

function chargeDamage(movement: Movement, config: BillingConfig): DamageLine {
  // §03.2 charges `manualCharge ?? replacementSnapshot` regardless of mode;
  // `damage_charge_mode` decides whether the UI asks for an amount, not how a
  // supplied amount is treated.
  const manual = movement.manualCharge !== undefined && movement.manualCharge !== null;
  const unitCharge = manual ? (movement.manualCharge as number) : movement.replacementSnapshot;

  return {
    itemId: movement.itemId,
    movementId: movement.id,
    type: movement.type as 'RETURN_DAMAGED' | 'LOST',
    qty: movement.qty,
    occurredOn: movement.movedAt,
    unitCharge,
    amount: roundLineTotal(movement.qty * unitCharge, config.rounding),
    manual,
  };
}
