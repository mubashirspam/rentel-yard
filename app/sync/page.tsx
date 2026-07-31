import { requirePageSession } from '@/lib/auth/page';

import { SyncScreen } from './sync-screen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The queue lives in the browser, so this page is a thin shell around a client
 * component. The session check stays server-side — an unauthenticated device
 * has nothing to sync.
 */
export default async function SyncPage() {
  await requirePageSession('/sync');
  return <SyncScreen />;
}
