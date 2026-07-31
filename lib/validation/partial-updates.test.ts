/**
 * A PATCH must change what it names, and nothing else.
 *
 * `updateItem` and `updateCustomer` write every key the parsed payload
 * contains. Zod's `.partial()` makes keys optional but leaves `.default()`
 * intact, so an update schema derived straight from a create schema quietly
 * fills the gaps — and the service dutifully writes those defaults over real
 * data.
 *
 * It is not hypothetical. Editing one item's rate through /items zeroed its
 * replacement rate, purchase cost, and quantity owned, and reset its sort
 * order, in the first database this product ever ran against. The `server_seq`
 * bump trigger (D17) is what made it visible.
 */

import { describe, expect, it } from 'vitest';

import { updateCustomerSchema } from './customers';
import { updateItemSchema } from './items';

describe('updateItemSchema', () => {
  it('returns only the fields that were sent', () => {
    expect(updateItemSchema.parse({ ratePerDay: 500 })).toEqual({ ratePerDay: 500 });
  });

  it('does not invent a unit, a quantity, or a sort order', () => {
    const parsed = updateItemSchema.parse({ name: 'Jack 3.0m' });

    expect(parsed).toEqual({ name: 'Jack 3.0m' });
    expect(parsed).not.toHaveProperty('unit');
    expect(parsed).not.toHaveProperty('qtyOwned');
    expect(parsed).not.toHaveProperty('purchaseCost');
    expect(parsed).not.toHaveProperty('replacementRate');
    expect(parsed).not.toHaveProperty('sortOrder');
  });

  it('still carries a real zero when one is sent', () => {
    // Retiring stock genuinely sets a quantity to zero — the fix must not turn
    // an explicit 0 into "unchanged".
    expect(updateItemSchema.parse({ qtyOwned: 0 })).toEqual({ qtyOwned: 0 });
  });

  it('accepts the fields it is supposed to', () => {
    expect(
      updateItemSchema.parse({ ratePerDay: 250, replacementRate: 52_000, isActive: false }),
    ).toEqual({ ratePerDay: 250, replacementRate: 52_000, isActive: false });
  });
});

describe('updateCustomerSchema', () => {
  it('leaves an unmentioned credit limit alone', () => {
    const parsed = updateCustomerSchema.parse({ name: 'Rahim Contractor' });

    expect(parsed).toEqual({ name: 'Rahim Contractor' });
    expect(parsed).not.toHaveProperty('creditLimit');
  });

  it('sets a credit limit when one is sent', () => {
    expect(updateCustomerSchema.parse({ creditLimit: 50_000_00 })).toEqual({
      creditLimit: 50_000_00,
    });
  });
});
