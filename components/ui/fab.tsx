import Link from 'next/link';

import { WORDS } from '@/lib/vocabulary';

/**
 * The one floating action: start a lending.
 *
 * This was a "+" that opened a sheet of four — lend, return, payment, new
 * customer — because the tabs did not offer them. They do now, or the screen
 * that owns them does: a return starts by pointing at what is out on a
 * customer's *Out now* tab, a payment at the bill it settles, a new contractor
 * at the top of Customers. A menu that lists every action from every screen is
 * a second navigation stacked on the first, and it sat directly over the tab
 * bar it duplicated.
 *
 * So one button, one destination, labelled rather than a bare glyph — and only
 * on the screens that ask for it (`<Screen fab>`), which today is Home.
 * `fixed` rather than `sticky`: it rides above the page and clears the tab bar
 * by `bottom-20` plus the phone's own safe area.
 */
export function Fab() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 mx-auto w-full max-w-2xl px-4 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-end">
        <Link
          href="/issue"
          className="tap pointer-events-auto inline-flex items-center gap-2 rounded-full bg-steel px-5 font-semibold text-white shadow-lg shadow-steel/25 transition-colors hover:bg-steel-strong"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="h-5 w-5"
            aria-hidden
          >
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          New {WORDS.lending.toLowerCase()}
        </Link>
      </div>
    </div>
  );
}
