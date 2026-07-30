import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { createUser, listUsers } from '@/lib/users/service';
import { createUserSchema } from '@/lib/validation/users';

export const runtime = 'nodejs';

export const GET = handler(async () => {
  const session = await requireSession();
  requireCapability(session, 'user.manage');

  return ok({ users: await listUsers(session) });
});

export const POST = handler(async (request: Request) => {
  const session = await requireSession();
  requireCapability(session, 'user.manage');

  const input = await parseBody(request, createUserSchema);

  return ok({ user: await createUser(session, input) }, 201);
});
