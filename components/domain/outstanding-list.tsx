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
}: {
  lines: OutstandingLine[];
  accountId: string;
}) {
  const perDay = lines.reduce((sum, line) => sum + line.accruingPerDay, 0);

  return (
    <Card>
      <ul className="divide-y divide-rule">
        {lines.map((line) => (
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
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t border-rule px-4 py-3 text-sm">
        <span className="font-medium">Accruing</span>
        <span className="font-medium">
          <Money paise={perDay} paiseDigits />
          /day
        </span>
      </div>
    </Card>
  );
}
