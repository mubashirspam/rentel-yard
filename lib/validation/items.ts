import { z } from 'zod';

import { paise, shortText } from './common';

/**
 * The shape of an item, with no defaults on it.
 *
 * Defaults belong to `createItemSchema` alone, deliberately. `.partial()` does
 * **not** strip a Zod default: `createItemSchema.partial().parse({ ratePerDay })`
 * still returns `{ unit: 'nos', replacementRate: 0, purchaseCost: 0, qtyOwned: 0,
 * sortOrder: 0 }`, and `updateItem` writes every key it is handed. So a PATCH
 * that changed only the rate silently zeroed the replacement rate, the purchase
 * cost, and the quantity owned — which is exactly what it did to two rows in
 * the first real database this met.
 *
 * A partial update therefore has to be built from a schema that never carried
 * defaults in the first place.
 */
const itemFields = z.object({
  name: shortText,
  /** Short code for fast entry in the yard. */
  code: z.string().trim().min(1).max(16).toUpperCase().optional().nullable(),
  unit: z.string().trim().min(1).max(16),
  /** Paise per unit per day. */
  ratePerDay: paise,
  /** Paise per unit, charged on damage or loss. */
  replacementRate: paise,
  purchaseCost: paise,
  qtyOwned: z.number().int().nonnegative(),
  sortOrder: z.number().int(),
});

export const createItemSchema = itemFields.extend({
  unit: z.string().trim().min(1).max(16).default('nos'),
  replacementRate: paise.default(0),
  purchaseCost: paise.default(0),
  qtyOwned: z.number().int().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = itemFields.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;
