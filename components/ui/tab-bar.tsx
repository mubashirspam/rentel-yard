'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * §08.5: "Bottom tab bar on mobile: Home · Issue · Return · Accounts · More."
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
    href: '/issue',
    label: 'Issue',
    icon: (
      <path d="M4 17V7a1 1 0 0 1 1-1h9v11H4zm10 0h3.5L20 13.5V10h-6v7zm-8.5 3.5A1.75 1.75 0 1 0 5.5 17a1.75 1.75 0 0 0 0 3.5zm11 0A1.75 1.75 0 1 0 16.5 17a1.75 1.75 0 0 0 0 3.5z" />
    ),
  },
  {
    href: '/return',
    label: 'Return',
    icon: <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />,
  },
  {
    href: '/accounts',
    label: 'Accounts',
    icon: (
      <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 4v2h14V9H5zm0 4v2h9v-2H5z" />
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
      className="sticky bottom-0 z-10 mt-auto border-t border-rule bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] backdrop-blur"
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
