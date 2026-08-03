/**
 * Returns, waiting.
 *
 * No section heading here — unlike Lend, this screen opens straight onto the
 * still-out / completed split, so the segmented control is the first thing
 * under the app bar and the skeleton has to start there too.
 */

import { Bar, FilterRow, LoadingScreen, SiteCard } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      {/* `Segmented`'s two-pill bar. */}
      <Bar className="mb-3 h-11 w-full rounded-xl" />

      <FilterRow />

      <div className="space-y-2.5">
        <SiteCard />
        <SiteCard sites={1} />
        <SiteCard />
      </div>
    </LoadingScreen>
  );
}
