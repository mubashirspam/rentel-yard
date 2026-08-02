/**
 * §08.2 "Currently out" — item, qty out, oldest issue date, days held, accruing
 * per day. Tapping a row starts a return for that item.
 *
 * Same tile shape as the lending and return screens: a name, a number, and a
 * row of chips. The facts are identical on all three, so they should not be
 * three different-looking things.
 */

import Link from 'next/link';

import type { OutstandingLine } from '@/lib/accounts/service';
import { formatDay, formatDays } from '@/lib/format';

import { Card, Chip } from '../ui/layout';
import { Money, Qty } from '../ui/money';

export function OutstandingList({
  lines,
  accountId,
  minimumDays = 0,
}: {
  lines: OutstandingLine[];
  accountId: string;
  /** The yard's minimum billing days — rows under it are billed at the floor. */
  minimumDays?: number;
}) {
  const perDay = lines.reduce((sum, line) => sum + line.accruingPerDay, 0);
  const soFar = lines.reduce((sum, line) => sum + line.accruedSoFar, 0);

  return (
    <div>
      <ul className="space-y-2.5">
        {lines.map((line, index) => {
          const billedDays = Math.max(line.daysHeld, minimumDays);
          const atMinimum = minimumDays > 0 && line.daysHeld < minimumDays;

          return (
            <li key={line.itemId}>
              <Link href={`/return?account=${accountId}&item=${line.itemId}`} className="tap block">
                <Card className="p-3 transition-colors hover:bg-paper">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="tabular shrink-0 text-xs font-semibold text-ink-3">
                        {index + 1}
                      </span>
                      <span className="truncate font-semibold">{line.itemName}</span>
                    </span>
                    <span className="shrink-0 font-semibold">
                      <Qty qty={line.qtyOut} unit={line.unit} />
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Chip>since {formatDay(line.since)}</Chip>
                    <Chip tone="amber">{formatDays(line.daysHeld)}</Chip>
                    <Chip tone="steel">
                      <Money paise={line.accruingPerDay} paiseDigits />
                      /day
                    </Chip>
                    <Chip>
                      rent so far <Money paise={line.accruedSoFar} />
                    </Chip>
                  </div>

                  {/* The running maths, so the figure never has to be taken on
                      trust: days billed × what a day costs = what it has cost. */}
                  <p className="tabular mt-1.5 text-xs text-ink-3">
                    {billedDays} {billedDays === 1 ? 'day' : 'days'}
                    {atMinimum && ` (min ${minimumDays})`} ×{' '}
                    <Money paise={line.accruingPerDay} paiseDigits /> ={' '}
                    <Money paise={line.accruedSoFar} />
                  </p>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>

      <Card className="mt-2.5 space-y-1 p-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Accruing</span>
          <span className="font-semibold">
            <Money paise={perDay} paiseDigits />
            /day
          </span>
        </div>
        <div className="flex items-baseline justify-between text-ink-2">
          <span>Accrued so far</span>
          <Money paise={soFar} className="font-semibold text-ink" />
        </div>
        <p className="text-xs text-ink-3">
          The amount grows by the /day figure every day until the items come back.
          {minimumDays > 0 && ` Anything returned before ${minimumDays} days is billed for ${minimumDays}.`}
        </p>
      </Card>
    </div>
  );
}
