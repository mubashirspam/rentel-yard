/**
 * Accounts, waiting.
 *
 * The heaviest list in the app: `listAccounts` for every khata open and closed,
 * then `billedRentByAccount` over all of them — two waves, not one, so this
 * frame is on screen for a while.
 */

import { Bar, LoadingScreen, SiteCard } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      {/* Not billed / Billed. */}
      <Bar className="mb-3 h-11 w-full rounded-xl" />

      {/* `AccountGroups` searches on its own, with no range select beside it. */}
      <Bar className="mb-3 h-11 w-full rounded-xl" />

      <div className="space-y-2.5">
        <SiteCard sites={2} />
        <SiteCard sites={1} />
        <SiteCard sites={3} />
      </div>
    </LoadingScreen>
  );
}
