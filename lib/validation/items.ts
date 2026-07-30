import { z } from 'zod';

import { paise, shortText } from './common';

export const createItemSchema = z.object({
  name: shortText,
  /** Short code for fast entry in the yard. */
  code: z.string().trim().min(1).max(16).toUpperCase().optional().nullable(),
  unit: z.string().trim().min(1).max(16).default('nos'),
  /** Paise per unit per day. */
  ratePerDay: paise,
  /** Paise per unit, charged on damage or loss. */
  replacementRate: paise.default(0),
  purchaseCost: paise.default(0),
  qtyOwned: z.number().int().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;
