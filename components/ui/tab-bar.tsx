'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * §08.5: "Bottom tab bar on mobile: Home · Issue · Return · Accounts · More."
 *
 * Both roles hold every capability these five reach, so the bar is the same for
 * everyone; /more is where the super_admin-only screens are shaped.
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
    icon: <path d="M4 17V7a1 1 0 0 1 1-1h9v11H4zm10 0h3.5L20 13.5V10h-6v7zm-8.5 3.5A1.75 1.75 0 1 0 5.5 17a1.75 1.75 0 0 0 0 3.5zm11 0A1.75 1.75 0 1 0 16.5 17a1.75 1.75 0 0 0 0 3.5z" />,
  },
  {
    href: '/return',
    label: 'Return',
    icon: <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />,
  },
  {
    href: '/accounts',
    label: 'Accounts',
    icon: <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 4v2h14V9H5zm0 4v2h9v-2H5z" />,
  },
  {
    href: '/more',
    label: 'More',
    icon: <path d="M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />,
  },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-10 mt-auto border-t border-rule bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_rgba(15,23,42,0.06)] backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`tap flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  active ? 'text-steel' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                  {tab.icon}
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
