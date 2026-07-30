/**
 * §08.2 balance card — "rent accrued to date, damages, charges, paid, net due
 * in large type".
 *
 * Every figure is derived by replaying the ledger (§00 rule 2), so the card
 * says which date it was valued at. Rent keeps accruing while equipment is out;
 * a balance without a date is a number nobody can check.
 */

import type { AccountBalance } from '@/lib/accrual';
import { formatDayFull } from '@/lib/format';

import { BigMoney, Money } from '../ui/money';
import { Card } from '../ui/layout';

export function BalanceCard({
  balance,
  asOf,
  minimumDays,
}: {
  balance: AccountBalance;
  asOf: string;
  /** Shown as a footnote — it is the figure most likely to be disputed. */
  minimumDays?: number;
}) {
  const tone = balance.status === 'due' ? 'due' : balance.status === 'settled' ? 'settled' : undefined;

  return (
    <Card className="p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-ink-2">
            {balance.status === 'advance' ? 'In advance' : 'Net due'}
          </p>
          <BigMoney paise={Math.abs(balance.balance)} tone={tone} />
        </div>
        <p className="text-right text-xs text-ink-3">as of {formatDayFull(asOf)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-rule pt-3 text-sm">
        <Line label="Rent accrued" paise={balance.rentTotal} />
        <Line label="Damages" paise={balance.damageTotal} />
        <Line label="Other charges" paise={balance.chargesTotal} />
        <Line label="Credits" paise={-balance.creditsTotal} />
        <Line label="Paid" paise={-balance.paidTotal} />
      </dl>

      {minimumDays !== undefined && minimumDays > 0 && (
        <p className="mt-3 border-t border-rule pt-2 text-xs text-ink-3">
          Every issue is billed for at least {minimumDays} days, per the yard&apos;s billing rules.
        </p>
      )}
    </Card>
  );
}

function Line({ label, paise }: { label: string; paise: number }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right">
        <Money paise={paise} />
      </dd>
    </>
  );
}
