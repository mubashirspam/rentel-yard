import { z } from 'zod';

import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { getSettings, setMessageLanguage } from '@/lib/settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Read by every signed-in staff member: the app needs the yard name and language. */
export const GET = handler(async () => {
  const session = await requireSession();
  return ok(await getSettings(session));
});

const schema = z.object({ messageLanguage: z.enum(['en', 'ml']) });

/** §11 settings. Super admin only — it changes what customers receive. */
export const PATCH = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'settings.manage');

  const { messageLanguage } = await parseBody(request, schema);
  await setMessageLanguage(session, messageLanguage);

  return ok({ messageLanguage });
});
