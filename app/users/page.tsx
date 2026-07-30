import { PageHeader, Screen } from '@/components/ui/layout';
import { can } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { listUsers } from '@/lib/users/service';

import { UsersScreen } from './users-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requirePageSession('/users');

  // Rendering the page at all is a `user.manage` decision — same map as the API.
  if (!can(session, 'user.manage')) {
    return (
      <Screen>
        <PageHeader title="Staff &amp; roles" back={{ href: '/more', label: 'More' }} />
        <p className="text-ink-2">Only a super admin can manage users. Ask the yard owner.</p>
      </Screen>
    );
  }

  return <UsersScreen initialUsers={await listUsers(session)} currentUserId={session.userId} />;
}
