import { z } from 'zod';

import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { setMessageLanguage } from '@/lib/settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ messageLanguage: z.enum(['en', 'ml']) });

/** §11 settings. Super admin only — it changes what customers receive. */
export const PATCH = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'settings.manage');

  const { messageLanguage } = await parseBody(request, schema);
  await setMessageLanguage(session, messageLanguage);

  return ok({ messageLanguage });
});
