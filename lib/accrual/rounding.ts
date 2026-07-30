/**
 * Rounding (§03.1).
 *
 * "Applied once to the final line total, never per day." Rounding each day's
 * rent and then summing drifts by up to half a rupee per day held, which on a
 * six-month rental of 200 sheets is a real number of rupees to argue about.
 */

import { PAISE_PER_RUPEE } from '../money';
import type { RoundingMode } from './types';

/** Round one line total, in paise, per the org's rounding mode. */
export function roundLineTotal(paise: number, mode: RoundingMode): number {
  switch (mode) {
    case 'nearest_rupee': {
      // Round half away from zero so ₹0.50 goes to ₹1, matching how a yard
      // owner rounds by hand. Math.round() would send -0.5 the other way.
      const sign = paise < 0 ? -1 : 1;
      const abs = Math.abs(paise);
      return sign * Math.round(abs / PAISE_PER_RUPEE) * PAISE_PER_RUPEE;
    }
    case 'none':
      return paise;
  }
}
