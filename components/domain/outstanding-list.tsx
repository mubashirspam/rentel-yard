/**
 * §08.2 "Currently out" — item, qty out, oldest issue date, days held, accruing
 * per day. Tapping a row starts a return for that item.
 */

import Link from 'next/link';

import type { OutstandingLine } from '@/lib/accounts/service';
import { formatDay, formatDays } from '@/lib/format';

import { Card } from '../ui/layout';
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
    <Card>
      <ul className="divide-y divide-rule">
        {lines.map((line) => {
          const billedDays = Math.max(line.daysHeld, minimumDays);
          const atMinimum = minimumDays > 0 && line.daysHeld < minimumDays;

          return (
            <li key={line.itemId}>
              <Link
                href={`/return?account=${accountId}&item=${line.itemId}`}
                className="tap block px-4 py-3 hover:bg-paper"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{line.itemName}</span>
                  <span className="font-medium">
                    <Qty qty={line.qtyOut} unit={line.unit} />
                  </span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-sm text-ink-2">
                  <span>
                    out since {formatDay(line.since)} · {formatDays(line.daysHeld)}
                  </span>
                  <span>
                    <Money paise={line.accruingPerDay} paiseDigits />
                    /day
                  </span>
                </div>
                {/* The running maths, so the figure never has to be taken on
                    trust: days billed × what a day costs = what it has cost. */}
                <p className="mt-1 text-sm">
                  <span className="tabular text-ink-2">
                    {billedDays} {billedDays === 1 ? 'day' : 'days'}
                    {atMinimum && ` (min ${minimumDays})`} ×{' '}
                    <Money paise={line.accruingPerDay} paiseDigits />
                  </span>{' '}
                  = <Money paise={line.accruedSoFar} className="font-medium" />
                  <span className="text-ink-3"> so far</span>
                </p>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1 border-t border-rule px-4 py-3 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Accruing</span>
          <span className="font-medium">
            <Money paise={perDay} paiseDigits />
            /day
          </span>
        </div>
        <div className="flex items-baseline justify-between text-ink-2">
          <span>Accrued so far</span>
          <Money paise={soFar} className="font-medium text-ink" />
        </div>
        <p className="text-xs text-ink-3">
          The amount grows by the /day figure every day until the items come back.
          {minimumDays > 0 && ` Anything returned before ${minimumDays} days is billed for ${minimumDays}.`}
        </p>
      </div>
    </Card>
  );
}
