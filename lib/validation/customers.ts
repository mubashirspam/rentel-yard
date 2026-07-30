import { z } from 'zod';

import { longText, mobile, paise, shortText } from './common';

export const createCustomerSchema = z.object({
  name: shortText,
  mobile,
  altMobile: mobile.optional().nullable(),
  address: longText.optional().nullable(),
  idProofUrl: z.url().optional().nullable(),
  /** Paise. 0 means no limit. */
  creditLimit: paise.default(0),
  notes: longText.optional().nullable(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isBlocked: z.boolean().optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const customerSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
