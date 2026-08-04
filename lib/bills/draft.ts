/**
 * Turning an account's ledger into one period's bill (§09).
 *
 * Pure, like the engine it builds on — no database, no clock. That matters
 * because this is the code that decides what a contractor is asked to pay, and
 * it has to be arguable line by line at a desk with a calculator.
 *
 * ## Why two accruals
 *
 * `accrue()` values a lot from the day it was issued up to `asOf`; it has no
 * notion of a billing period. Billing June after May has already been billed
 * therefore means: value everything to 30-Jun, value everything to 30-Apr…
 * sorry, to the day before the period starts — and charge the difference.
 *
 * Written out for one lot of 100 jacks issued 01-May, 60 returned 21-Jun, the
 * rest still out at 30-Jun, with May already billed:
 *
 *     prior (to 31-May)   100 units × 31 days
 *     current (to 30-Jun)  60 units × 51 days  +  40 units × 60 days
 *     this bill            60 units × 20 days  +  40 units × 29 days
 *
 * Each unit is charged for every day it was out, exactly once, across all the
 * bills that ever mention it. That is the property the whole scheme rests on:
 * no double billing, no gaps, however the lot is sliced up over time.
 */

import type {
  AccrualResult,
  BillingConfig,
  DamageLine,
  IsoDate,
  RentLine,
} from '../accrual';
import { addDays, roundLineTotal } from '../accrual';

export interface BillLineDraft {
  itemId: string;
  itemName: string;
  lotId: string;
  qty: number;
  /** When the lot left the yard — what the customer recognises. */
  from: IsoDate;
  /** The return date, or `null` while the units are still out. */
  to: IsoDate | null;
  /** Days charged **on this bill**, after the minimum-days floor. */
  days: number;
  /** Days of this lot's run already charged on an earlier bill. */
  daysBilledEarlier: number;
  ratePerDay: number;
  /** Paise, rounded once per `config.rounding`. */
  amount: number;
}

export interface BillAdjustmentDraft {
  id: string;
  kind: 'charge' | 'credit';
  amount: number;
  reason: string;
  appliedOn: IsoDate;
}

/**
 * What a bill covers.
 *
 * `all` charges everything accrued in the period, including rent still running
 * on equipment that has not come back. `returned` charges only lots that have
 * actually been returned, and leaves the rest to be billed when they are —
 * which is how a yard that invoices per completed job works: bill what is
 * finished, bill the rest in five days when the lorry comes back.
 */
export type BillScope = 'all' | 'returned';

export interface BillDraft {
  scope: BillScope;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  lines: BillLineDraft[];
  damageLines: Array<DamageLine & { itemName: string }>;
  adjustments: BillAdjustmentDraft[];
  rentTotal: number;
  damageTotal: number;
  chargesTotal: number;
  creditsTotal: number;
  /** rent + damages + charges − credits. Payments are settled separately. */
  grandTotal: number;
  /** Rent this account has already been billed for, before this period. */
  billedEarlier: number;
  /**
   * Days already charged on each lot's *still-open* units, after this bill.
   *
   * This is what makes `returned` scope safe. Under `all`, a lot open at the
   * period end is charged up to that date and the count records it, so the next
   * bill subtracts it. Under `returned` nothing was charged for those units, so
   * the count stays where it was and the full run is charged when they come
   * back. Without it, skipping an open lot once would silently forgive its rent
   * forever.
   */
  openDaysBilledByLot: Record<string, number>;
  /**
   * Total rent the ledger says has accrued from the account's first day to
   * `periodTo`, frozen into the bill.
   *
   * The next bill compares its own "before this period" figure against this
   * one. They differ only when the ledger changed behind an issued bill — a
   * gate pass written up late, or a reversal — which is a thing an admin has to
   * be told about, since neither bill can be edited afterwards.
   */
  accruedToDate: number;
}

export interface BuildBillDraftInput {
  /** The account accrued to `periodTo`. */
  current: AccrualResult;
  /**
   * The account accrued to the day before `periodFrom`, or `null` for a first
   * bill — which charges the account's whole history.
   */
  prior: AccrualResult | null;
  adjustments: readonly BillAdjustmentDraft[];
  itemNames: Readonly<Record<string, string>>;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  config: BillingConfig;
  /**
   * Defaults to `all` here — this is the pure engine, and `all` is the neutral
   * "value the whole period" reading of a ledger.
   *
   * The *product's* default is `returned`, and it is set at the boundary
   * instead: the validation schemas and the generate-bill screen. Keeping the
   * engine neutral is what lets `draft.test.ts` and `lifecycle.test.ts` go on
   * pinning the whole-run arithmetic by hand without every case having to
   * restate which mode it means.
   */
  scope?: BillScope;
  /**
   * `openDaysBilledByLot` from the last bill on this account. Absent for a
   * first bill, and for bills issued before the field existed — in which case
   * the prior accrual's open-line days are used, which is what those bills
   * actually charged.
   */
  previousOpenDays?: Readonly<Record<string, number>>;
}

export function buildBillDraft(input: BuildBillDraftInput): BillDraft {
  const { current, prior, itemNames, periodFrom, periodTo, config } = input;
  const scope = input.scope ?? 'all';

  const priorByLot = groupLinesByLot(prior?.lines ?? []);
  const lines: BillLineDraft[] = [];
  const openDaysBilledByLot: Record<string, number> = {};

  for (const [lotId, currentLines] of groupLinesByLot(current.lines)) {
    const priorLines = priorByLot.get(lotId) ?? [];

    // Days already charged on the units that were still out when the last
    // period closed. Every unit of a lot open at that moment shares one issue
    // date, so one number covers them all.
    //
    // Taken from what the last bill *recorded charging*, falling back to the
    // prior accrual for bills raised before that was tracked.
    const daysBilledEarlier =
      input.previousOpenDays?.[lotId] ?? priorLines.find((line) => line.to === null)?.days ?? 0;

    // Returns that had already happened are settled: a closed slice never
    // changes, so it is billed once and skipped forever after. The engine
    // emits slices in ledger order, so the earlier period's closed slices are
    // a prefix of this one's.
    const settled = priorLines.filter((line) => line.to !== null).length;

    for (const line of currentLines.slice(settled)) {
      const days = line.days - daysBilledEarlier;

      if (line.to === null) {
        // Still out. Under `returned` scope it is not billed at all, and the
        // count of what has been charged stays where it was.
        openDaysBilledByLot[lotId] = scope === 'all' ? line.days : daysBilledEarlier;
        if (scope === 'returned') continue;
      }

      // Zero happens legitimately: a lot returned inside its minimum-days
      // window after being billed at that minimum owes nothing further.
      if (days === 0) continue;

      lines.push({
        itemId: line.itemId,
        itemName: itemNames[line.itemId] ?? 'Unknown item',
        lotId,
        qty: line.qty,
        from: line.from,
        to: line.to,
        days,
        daysBilledEarlier,
        ratePerDay: line.ratePerDay,
        amount: roundLineTotal(line.qty * days * line.ratePerDay, config.rounding),
      });
    }
  }

  // Damage the previous period's replay already knew about has been billed.
  const billedDamage = new Set((prior?.damageLines ?? []).map((line) => line.movementId));
  const damageLines = current.damageLines
    .filter((line) => !billedDamage.has(line.movementId))
    .map((line) => ({ ...line, itemName: itemNames[line.itemId] ?? 'Unknown item' }));

  const adjustments = input.adjustments.filter(
    (adjustment) => adjustment.appliedOn >= periodFrom && adjustment.appliedOn <= periodTo,
  );

  const rentTotal = sum(lines.map((line) => line.amount));
  const damageTotal = sum(damageLines.map((line) => line.amount));
  const chargesTotal = sum(
    adjustments.filter((a) => a.kind === 'charge').map((a) => a.amount),
  );
  const creditsTotal = sum(
    adjustments.filter((a) => a.kind === 'credit').map((a) => a.amount),
  );

  return {
    scope,
    periodFrom,
    periodTo,
    lines,
    damageLines,
    adjustments,
    rentTotal,
    damageTotal,
    chargesTotal,
    creditsTotal,
    grandTotal: rentTotal + damageTotal + chargesTotal - creditsTotal,
    billedEarlier: prior?.rentTotal ?? 0,
    openDaysBilledByLot,
    accruedToDate: current.rentTotal,
  };
}

/**
 * The period a bill should default to (§09): the day after the last bill's
 * `period_to`, through today. A first bill starts the day the account opened.
 */
export function defaultBillPeriod(input: {
  openedOn: IsoDate;
  lastPeriodTo: IsoDate | null;
  today: IsoDate;
}): { periodFrom: IsoDate; periodTo: IsoDate } {
  const periodFrom = input.lastPeriodTo ? addDays(input.lastPeriodTo, 1) : input.openedOn;

  return {
    periodFrom,
    // A period that would end before it starts means the last bill already ran
    // to today; offer the single day rather than an inverted range.
    periodTo: input.today < periodFrom ? periodFrom : input.today,
  };
}

function groupLinesByLot(lines: readonly RentLine[]): Map<string, RentLine[]> {
  const byLot = new Map<string, RentLine[]>();

  for (const line of lines) {
    const existing = byLot.get(line.lotId);
    if (existing) existing.push(line);
    else byLot.set(line.lotId, [line]);
  }

  return byLot;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
