import { PageHeader, Screen } from '@/components/ui/layout';
import { can } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { getSettings } from '@/lib/settings/service';

import { MessagesScreen } from './messages-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MessageSettingsPage() {
  const session = await requirePageSession('/settings/messages');
  const settings = await getSettings(session);

  return (
    <Screen>
      <PageHeader back={{ href: '/more', label: 'More' }} title="Messages" />
      <MessagesScreen
        initial={settings.messageLanguage}
        yardName={settings.yardName}
        canEdit={can(session, 'settings.manage')}
      />
    </Screen>
  );
}
