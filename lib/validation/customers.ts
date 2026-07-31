import { z } from 'zod';

import { longText, mobile, paise, shortText } from './common';

/**
 * No defaults here — see the note in `items.ts`. `.partial()` leaves Zod
 * defaults intact, so a PATCH carrying only a corrected spelling of a name
 * would have reset the contractor's agreed credit limit to zero.
 */
const customerFields = z.object({
  name: shortText,
  mobile,
  altMobile: mobile.optional().nullable(),
  address: longText.optional().nullable(),
  idProofUrl: z.url().optional().nullable(),
  /** Paise. 0 means no limit. */
  creditLimit: paise,
  notes: longText.optional().nullable(),
});

export const createCustomerSchema = customerFields.extend({
  creditLimit: paise.default(0),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = customerFields.partial().extend({
  isBlocked: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
