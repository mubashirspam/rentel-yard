/**
 * Money on screen.
 *
 * The only place paise become a string for a human (§00 rule 3). Tabular
 * figures so columns line up when an admin scans a ledger (§08.5).
 */

import { formatPaise } from '@/lib/money';

export function Money({
  paise,
  className = '',
  paiseDigits = false,
  symbol = true,
}: {
  paise: number;
  className?: string;
  /** Force two decimals — used where a rate would otherwise read as "₹2". */
  paiseDigits?: boolean;
  /** Drop the ₹ where a column header already carries it. */
  symbol?: boolean;
}) {
  return (
    <span className={`tabular ${className}`}>{formatPaise(paise, { paiseDigits, symbol })}</span>
  );
}

/** The one big number on a screen — a net due, a period total. */
export function BigMoney({ paise, tone }: { paise: number; tone?: 'due' | 'settled' }) {
  const colour = tone === 'due' ? 'text-red' : tone === 'settled' ? 'text-green' : 'text-ink';
  return (
    <span className={`tabular text-3xl font-bold tracking-tight ${colour}`}>
      {formatPaise(paise)}
    </span>
  );
}

/** A quantity. Same tabular treatment, because it sits in the same columns. */
export function Qty({ qty, unit }: { qty: number; unit?: string }) {
  return (
    <span className="tabular">
      {qty}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}
