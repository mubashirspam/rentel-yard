import { z } from 'zod';

import { isoDate, longText, shortText, uuid } from './common';

export const openAccountSchema = z.object({
  customerId: uuid,
  siteName: shortText,
  siteAddress: longText.optional().nullable(),
  openedOn: isoDate,
});

export type OpenAccountInput = z.infer<typeof openAccountSchema>;

export const closeAccountSchema = z.object({
  closedOn: isoDate,
});

export type CloseAccountInput = z.infer<typeof closeAccountSchema>;

export const accountSearchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['open', 'closed', 'all']).default('open'),
  customerId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
