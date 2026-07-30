/**
 * Types for the rent accrual engine (§03).
 *
 * Every amount is integer paise. Every date is a `YYYY-MM-DD` string.
 */

import type { IsoDate } from './dates';

export type ItemId = string;

export type MovementType = 'ISSUE' | 'RETURN' | 'RETURN_DAMAGED' | 'LOST' | 'REVERSAL';

/** Movement types that consume outstanding quantity from open lots. */
export const CONSUMING_TYPES = ['RETURN', 'RETURN_DAMAGED', 'LOST'] as const;
export type ConsumingType = (typeof CONSUMING_TYPES)[number];

/**
 * One row of the append-only ledger, reduced to the fields accrual needs.
 * Callers map database rows onto this shape; the engine never sees the DB.
 */
export interface Movement {
  id: string;
  itemId: ItemId;
  type: MovementType;
  /** Whole units. Always positive — direction comes from `type`. */
  qty: number;
  movedAt: IsoDate;
  /** Paise per unit per day, frozen onto the ISSUE row (§02 invariant). */
  rateSnapshot: number;
  /** Paise per unit, frozen at issue time, charged on damage or loss. */
  replacementSnapshot: number;
  /** Paise per unit. Overrides `replacementSnapshot` when the admin typed one. */
  manualCharge?: number;
  /** Set on REVERSAL rows: the id of the movement being cancelled. */
  reversesId?: string | null;
  /** Server insert time. Breaks ties between movements on the same `movedAt`. */
  createdAt?: string;
}

export type DayCountMode = 'inclusive_start' | 'inclusive_both';
export type MinimumDaysScope = 'per_issue_lot';
export type RoundingMode = 'nearest_rupee' | 'none';
export type DamageChargeMode = 'replacement_rate' | 'manual';

/**
 * The §03.1 billing configuration. Stored per org in `settings.billing` and
 * always passed in as an argument — the engine never reads a global.
 */
export interface BillingConfig {
  day_count_mode: DayCountMode;
  /** Every issued unit is billed for at least this many days. */
  minimum_days: number;
  minimum_days_applies: MinimumDaysScope;
  rounding: RoundingMode;
  damage_charge_mode: DamageChargeMode;
  /** When false, rent keeps accruing past a bill until items physically return. */
  accrual_stops_on_bill: boolean;
}

/** A rent line: one FIFO slice of one issue lot, billed over one span of days. */
export interface RentLine {
  itemId: ItemId;
  /** Id of the ISSUE movement that opened the lot. */
  lotId: string;
  qty: number;
  from: IsoDate;
  /** The return date, or `null` while the slice is still out. */
  to: IsoDate | null;
  /** The date rent was actually counted to — `to`, or `asOf` for open slices. */
  through: IsoDate;
  /** Days billed, after the minimum-days floor. */
  days: number;
  /** Days the calendar actually gives, before the floor. */
  rawDays: number;
  minimumApplied: boolean;
  /** Paise per unit per day. */
  ratePerDay: number;
  /** Paise, rounded once per `config.rounding`. */
  amount: number;
}

/** A damage or loss charge, one per RETURN_DAMAGED / LOST movement. */
export interface DamageLine {
  itemId: ItemId;
  movementId: string;
  type: 'RETURN_DAMAGED' | 'LOST';
  qty: number;
  occurredOn: IsoDate;
  /** Paise per unit actually charged. */
  unitCharge: number;
  /** Paise, rounded once per `config.rounding`. */
  amount: number;
  /** True when the charge came from `manualCharge` rather than the replacement rate. */
  manual: boolean;
}

/** A lot still out at `asOf` — the raw material of the ageing report (§10). */
export interface OpenLot {
  itemId: ItemId;
  lotId: string;
  /** Units still out from this lot. */
  qty: number;
  from: IsoDate;
  /** Calendar days held as of the valuation date, before any minimum. */
  daysHeld: number;
  ratePerDay: number;
  /** Paise accrued so far on this lot. */
  accruedAmount: number;
}

export interface AccrualResult {
  /** One entry per billed slice, in the order the ledger produced them. */
  lines: RentLine[];
  damageLines: DamageLine[];
  /** Paise. Sum of `lines[].amount`. */
  rentTotal: number;
  /** Paise. Sum of `damageLines[].amount`. */
  damageTotal: number;
  /** Units still out per item. Includes items that have gone back to zero. */
  outstanding: Record<ItemId, number>;
  /** Units written off as LOST per item — reduces effective owned stock (§02). */
  lostByItem: Record<ItemId, number>;
  openLots: OpenLot[];
  /** The valuation date the result was computed against. */
  asOf: IsoDate;
}
