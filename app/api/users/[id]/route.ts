import { handler, ok, parseBody } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { updateUser } from '@/lib/users/service';
import { updateUserSchema } from '@/lib/validation/users';

export const runtime = 'nodejs';

export const PATCH = handler(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const session = await requireSession();
    requireCapability(session, 'user.manage');

    const { id } = await context.params;
    const input = await parseBody(request, updateUserSchema);

    return ok({ user: await updateUser(session, id, input) });
  },
);
