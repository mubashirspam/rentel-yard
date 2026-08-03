/**
 * Lend, waiting.
 *
 * The "New lending" button is real and tappable straight away: it is a plain
 * link to `/issue?new=1` that needs nothing from the server to be correct, and
 * an admin who opened this tab to start a lending should not have to wait for a
 * list they were never going to read.
 */

import Link from 'next/link';

import { FilterRow, LoadingScreen, SiteCard, TitleBar } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      <Link
        href="/issue?new=1"
        className="tap mb-4 flex items-center justify-center gap-1.5 rounded-xl bg-steel px-3 font-semibold text-white hover:bg-steel-strong"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className="h-4 w-4"
          aria-hidden
        >
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        New lending
      </Link>

      <TitleBar />
      <FilterRow />
      <div className="space-y-2.5">
        <SiteCard />
        <SiteCard sites={1} />
        <SiteCard />
      </div>
    </LoadingScreen>
  );
}
