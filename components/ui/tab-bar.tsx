'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { WORDS } from '@/lib/vocabulary';

/**
 * Home · Customers · Lend · Stock · More.
 *
 * §08.5 originally named Issue, Return and Accounts here. Three of those five
 * destinations opened onto the same list of sites in three different card
 * designs, which is what scattered one contractor across four tabs. **Return**
 * and **Accounts** are gone: a return is an action on a thing that is out, so
 * it starts from the customer holding it, and an account is a section of that
 * customer rather than a place of its own. What is left is genuinely global —
 * the day, the people, the act of lending, the yard's own stock, and settings.
 *
 * The active tab is a filled pill that **slides** between positions rather than
 * appearing and disappearing. That is not decoration: on a 360px screen with
 * five destinations, a moving object tells a thumb where it just came from and
 * where it is now, which a colour change alone does not. It costs one transform
 * at 150ms — the ceiling §08.5 sets for animation.
 *
 * The slide is pure CSS on a single element. Five equal-width tabs mean the
 * pill's position is `index × 20%`, with no measuring, no resize observer, and
 * nothing to go wrong when the screen rotates.
 */
const TABS = [
  {
    href: '/',
    label: 'Home',
    icon: <path d="M12 3l9 8h-3v9h-4v-6H10v6H6v-9H3l9-8z" />,
  },
  {
    href: '/customers',
    label: 'Customers',
    icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" />,
  },
  {
    /* The route keeps its name (D60) — only the label is the owner's word. */
    href: '/issue',
    label: WORDS.lendTab,
    icon: (
      <path d="M4 17V7a1 1 0 0 1 1-1h9v11H4zm10 0h3.5L20 13.5V10h-6v7zm-8.5 3.5A1.75 1.75 0 1 0 5.5 17a1.75 1.75 0 0 0 0 3.5zm11 0A1.75 1.75 0 1 0 16.5 17a1.75 1.75 0 0 0 0 3.5z" />
    ),
  },
  {
    href: '/stock',
    label: 'Stock',
    icon: (
      <path d="M12 2l9 4.5v11L12 22l-9-4.5v-11L12 2zm0 2.2L5.4 7.5 12 10.8l6.6-3.3L12 4.2zM5 9.3v7l6 3v-7l-6-3zm8 10l6-3v-7l-6 3v7z" />
    ),
  },
  {
    href: '/more',
    label: 'More',
    icon: <path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />,
  },
];

const WIDTH = 100 / TABS.length;

export function TabBar() {
  const pathname = usePathname();

  const activeIndex = TABS.reduce(
    (found, tab, index) =>
      (tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)) ? index : found,
    -1,
  );

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-10 mt-auto border-t border-rule bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="relative mx-auto w-full max-w-2xl">
        {/* The pill. One element, moved by transform — no layout work, so it
            stays smooth on a mid-range Android. */}
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1.5 left-0 z-0 px-1.5 transition-transform duration-150 ease-out motion-reduce:transition-none"
            style={{ width: `${WIDTH}%`, transform: `translateX(${activeIndex * 100}%)` }}
          >
            <span className="block h-full w-full rounded-xl bg-steel-soft" />
          </span>
        )}

        <ul className="relative z-10 flex">
          {TABS.map((tab, index) => {
            const active = index === activeIndex;

            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`tap flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-150 ${
                    active ? 'text-steel' : 'text-ink-3 hover:text-ink-2'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden
                    className={`h-5 w-5 transition-transform duration-150 motion-reduce:transition-none ${
                      active ? '-translate-y-0.5 scale-110' : ''
                    }`}
                  >
                    {tab.icon}
                  </svg>
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
