/**
 * Money crosses the app boundary exactly twice: rupees in from a form, rupees
 * out to a screen. Everywhere in between it is an integer number of paise.
 *
 * Per §00 rule 3 and §14: no float ever holds an amount, including in JSON.
 */

import { LedgerError, ERROR_CODES } from './errors';

export const PAISE_PER_RUPEE = 100;

const RUPEE_INPUT = /^-?\d+(\.\d{1,2})?$/;

/**
 * Parse user-typed rupees ("1,250.50") into integer paise. This is the only
 * place a decimal string becomes money — call it at the edge, never deeper.
 */
export function rupeesToPaise(input: string | number): number {
  const raw = typeof input === 'number' ? input.toFixed(2) : input.trim().replace(/,/g, '');

  if (!RUPEE_INPUT.test(raw)) {
    throw new LedgerError(
      ERROR_CODES.INVALID_CONFIG,
      `"${input}" is not an amount in rupees. Use digits with up to two decimal places.`,
      { context: { input } },
    );
  }

  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = (negative ? raw.slice(1) : raw).split('.');
  const paise = Number(whole) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, '0'));

  return negative ? -paise : paise;
}

export interface FormatPaiseOptions {
  /** Render the ₹ sign. Default true. */
  symbol?: boolean;
  /** Always show two decimals. Default false — whole rupees render bare. */
  paiseDigits?: boolean;
}

/**
 * Format integer paise as Indian-grouped rupees for display only. Never feed
 * the result back into a calculation.
 */
export function formatPaise(paise: number, options: FormatPaiseOptions = {}): string {
  const { symbol = true, paiseDigits = false } = options;

  if (!Number.isInteger(paise)) {
    throw new LedgerError(ERROR_CODES.INVALID_CONFIG, `Amount ${paise} is not a whole number of paise.`, {
      context: { paise },
    });
  }

  const negative = paise < 0;
  const abs = Math.abs(paise);

  // Split before formatting so no division ever produces a float amount.
  const rupees = Math.trunc(abs / PAISE_PER_RUPEE);
  const remainder = abs % PAISE_PER_RUPEE;
  const showDecimals = paiseDigits || remainder !== 0;

  const grouped = new Intl.NumberFormat('en-IN', { useGrouping: true }).format(rupees);
  const decimals = showDecimals ? `.${String(remainder).padStart(2, '0')}` : '';

  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${grouped}${decimals}`;
}
