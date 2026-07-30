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
  { href: '/', label: 'Home' },
  { href: '/issue', label: 'Issue' },
  { href: '/return', label: 'Return' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/more', label: 'More' },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-10 mt-auto border-t border-rule bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`tap flex h-14 flex-col items-center justify-center text-sm font-medium ${
                  active ? 'text-steel' : 'text-ink-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`mb-1 h-0.5 w-6 rounded ${active ? 'bg-steel' : 'bg-transparent'}`}
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
