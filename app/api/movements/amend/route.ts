import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { today } from '@/lib/clock';
import { amendIssue } from '@/lib/movements/service';
import { amendIssueSchema } from '@/lib/validation/movements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Correct an issue before any return or bill. Reverses and re-issues (§02). */
export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'movement.reverse');

  const input = await parseBody(request, amendIssueSchema);

  return ok(await amendIssue(session, input, today()));
});
