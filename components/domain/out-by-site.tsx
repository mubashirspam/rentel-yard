/**
 * What a contractor is holding: a table per site, split by the day it went out.
 *
 * Grouping by date is what makes the table narrow enough to be one. Everything
 * that left the yard on the same day has been held the same number of days, so
 * "days" stops being a column that repeats itself down the page and becomes the
 * heading — which leaves item, quantity, rate and amount, and those four fit on
 * a phone.
 *
 * It also matches how a load is remembered. A yard does not think "twenty base
 * plates, and separately ten jacks"; it thinks "the lorry that went out on
 * Friday", and that is one heading with its contents underneath.
 *
 * The rows are links rather than `<tr>`s on purpose. A return starts by
 * pointing at one line — "these sheets are coming back" — so every row has to
 * be tappable, and a table row cannot contain a link covering all its cells.
 * The grid gives the aligned columns without giving that up.
 */

import Link from 'next/link';

import type { CustomerSite, OutstandingLine } from '@/lib/accounts/service';
import { formatDayWeekday, formatDays } from '@/lib/format';

import { Card } from '../ui/layout';
import { Money } from '../ui/money';

/**
 * The one column definition, shared by the header, every row, and the subtotal.
 *
 * Fixed widths, not `auto`. Each of those elements is its own grid — they have
 * to be, because a row is a link and a link cannot span a parent grid's cells —
 * and `auto` columns size to the content of *their own* grid. So the header sat
 * at one set of widths and each row at another, and nothing lined up with
 * anything. Naming the widths once is what makes them a table rather than four
 * separate rows that happen to be near each other.
 */
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_3.25rem_3.5rem_4.25rem] gap-x-2';

interface DateGroup {
  since: string;
  daysHeld: number;
  lines: OutstandingLine[];
}

/**
 * One group per day equipment left the yard, oldest first — the longest-held
 * load is the one somebody has to ring about.
 */
function byDate(lines: OutstandingLine[]): DateGroup[] {
  const groups = new Map<string, DateGroup>();

  for (const line of lines) {
    const group = groups.get(line.since) ?? {
      since: line.since,
      daysHeld: line.daysHeld,
      lines: [],
    };
    group.lines.push(line);
    groups.set(line.since, group);
  }

  return [...groups.values()].sort((a, b) => a.since.localeCompare(b.since));
}

export function OutBySite({
  sites,
  minimumDays = 0,
}: {
  sites: CustomerSite[];
  /** The yard's minimum billing days — groups under it are billed at the floor. */
  minimumDays?: number;
}) {
  return (
    <ul className="space-y-2.5">
      {sites.map((site) => (
        <li key={site.accountId}>
          <Card className="overflow-hidden">
            {/* Level one: the place. Steel, because it is the yard's own work. */}
            <div className="flex items-baseline justify-between gap-3 bg-steel px-4 py-2.5 text-white">
              <span className="truncate text-base font-bold">{site.siteName}</span>
              <span className="flex shrink-0 items-baseline gap-2 text-sm">
                <span className="font-medium text-white/80">
                  <Money paise={site.perDay} paiseDigits />
                  /day
                </span>
                <Money paise={site.accruedRent} className="text-lg font-bold" />
              </span>
            </div>

            {byDate(site.outstanding).map((group) => {
              const billedDays = Math.max(group.daysHeld, minimumDays);
              const atMinimum = minimumDays > 0 && group.daysHeld < minimumDays;
              const groupTotal = group.lines.reduce((sum, line) => sum + line.accruedSoFar, 0);
              const groupQty = group.lines.reduce((sum, line) => sum + line.qtyOut, 0);

              /*
               * One tone for the whole group — the heading that opens it and
               * the total that closes it are the same band, so they are the
               * same colour, and the white rows sit between them. Amber once
               * the load has stood a month, which is the warning colour used
               * everywhere else for "pending too long".
               */
              const band =
                billedDays > 30 ? 'bg-amber-soft text-amber' : 'bg-steel-soft text-steel';

              return (
                <section key={group.since}>
                  {/* Level two: the load. The two facts every row below shares,
                      which is exactly why neither of them is a column. */}
                  <div
                    className={`flex items-baseline justify-between gap-2 border-y border-rule px-4 py-2 ${band}`}
                  >
                    <span className="text-base font-bold">{formatDayWeekday(group.since)}</span>
                    <span className="shrink-0 text-right">
                      <span className="tabular text-base font-bold">{formatDays(billedDays)}</span>
                      {atMinimum && (
                        <span className="block text-[11px] font-medium opacity-80">
                          {minimumDays}-day minimum
                        </span>
                      )}
                    </span>
                  </div>

                  <div
                    className={`${COLUMNS} px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-2`}
                  >
                    <span>Item</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Per day</span>
                    <span className="text-right">Amount</span>
                  </div>

                  <ul className="divide-y divide-rule border-t border-rule">
                    {group.lines.map((line) => (
                      <li key={line.itemId}>
                        <Link
                          href={`/return?account=${site.accountId}&item=${line.itemId}`}
                          className={`${COLUMNS} items-baseline px-4 py-2 text-sm transition-colors hover:bg-steel-soft`}
                        >
                          {/* Wraps rather than truncates. An item name is what
                              the admin matches against the stack on the lorry,
                              and "Jack (adjustable prop)…" is not something you
                              can count against. */}
                          <span className="font-medium leading-snug">{line.itemName}</span>
                          <span className="tabular text-right font-bold">
                            {line.qtyOut}
                            <span className="ml-0.5 text-[10px] font-normal text-ink-2">
                              {line.unit}
                            </span>
                          </span>
                          <span className="tabular text-right font-semibold text-steel">
                            <Money paise={line.accruingPerDay} paiseDigits symbol={false} />
                          </span>
                          <span className="tabular text-right font-bold">
                            <Money paise={line.accruedSoFar} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {/* Only when there is something to add up. Same band as the
                      heading, so the group reads as one block bracketed top and
                      bottom rather than as two unrelated coloured stripes. */}
                  {group.lines.length > 1 && (
                    <div
                      className={`${COLUMNS} items-baseline border-t border-rule px-4 py-2 text-sm ${band}`}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide opacity-75">
                        {group.lines.length} items
                      </span>
                      <span className="tabular text-right font-bold">{groupQty}</span>
                      <span />
                      <span className="tabular text-right font-bold">
                        <Money paise={groupTotal} />
                      </span>
                    </div>
                  )}
                </section>
              );
            })}
          </Card>
        </li>
      ))}
    </ul>
  );
}
