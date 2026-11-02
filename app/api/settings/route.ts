import { z } from 'zod';

import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import {
  ACCOUNT_NUMBER_PATTERN,
  IFSC_PATTERN,
  UPI_ID_PATTERN,
} from '@/lib/payments/upi';
import { getSettings, setMessageLanguage, setPaymentDetails } from '@/lib/settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read by every signed-in staff member: the app needs the yard name and language. */
export const GET = handler(async () => {
  const session = await requireSession();
  return ok(await getSettings(session));
});

/** Empty string clears a field; anything else must look right. */
const optional = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .max(120)
    .refine((v) => v === '' || pattern.test(v), { message })
    .nullable();

const paymentSchema = z.object({
  payeeName: z.string().trim().max(60).nullable(),
  upiId: optional(UPI_ID_PATTERN, 'Enter a UPI ID like yourname@okaxis.'),
  bankName: z.string().trim().max(80).nullable(),
  bankAccountName: z.string().trim().max(80).nullable(),
  bankAccountNumber: optional(ACCOUNT_NUMBER_PATTERN, 'Account number is 9 to 18 digits.'),
  bankIfsc: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => v === '' || IFSC_PATTERN.test(v), {
      message: 'IFSC is 11 characters, like SBIN0001234.',
    })
    .nullable(),
});

const schema = z
  .object({
    messageLanguage: z.enum(['en', 'ml']).optional(),
    payment: paymentSchema.optional(),
  })
  .refine((v) => v.messageLanguage !== undefined || v.payment !== undefined, {
    message: 'Nothing to change.',
  });

/** §11 settings. Super admin only — it changes what customers receive. */
export const PATCH = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'settings.manage');

  const { messageLanguage, payment } = await parseBody(request, schema);
  if (messageLanguage) await setMessageLanguage(session, messageLanguage);
  if (payment) await setPaymentDetails(session, payment);

  return ok(await getSettings(session));
});
