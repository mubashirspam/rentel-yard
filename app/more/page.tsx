/**
 * The fifth tab (§08.5). Everything that is not Home, Lend, Return, or
 * Accounts, shaped by capability so nobody taps into a 403.
 *
 * A tile grid rather than a list: these are destinations, not rows of data,
 * and an icon a thumb recognises beats a sentence at a glance. Two columns at
 * 360px keeps every tile a comfortable 44px+ target.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Card, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { can } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';

import { SignOutButton } from './sign-out';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Tile {
  href: string;
  label: string;
  hint: string;
  show: boolean;
  icon: ReactNode;
}

export default async function MorePage() {
  const session = await requirePageSession('/more');

  const tiles: Tile[] = [
    {
      href: '/customers',
      label: 'Customers',
      hint: 'Search, add, limits',
      show: can(session, 'customer.manage'),
      icon: <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" />,
    },
    {
      href: '/payments/new',
      label: 'Payment',
      hint: 'Record money received',
      show: can(session, 'payment.create'),
      icon: (
        <path d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      ),
    },
    {
      href: '/stock',
      label: 'Stock',
      hint: 'Owned, out, available',
      show: can(session, 'movement.create'),
      icon: <path d="M4 7l8-4 8 4v10l-8 4-8-4V7zm8 4l8-4M12 11L4 7m8 4v10" />,
    },
    {
      href: '/reports',
      label: 'Reports',
      hint: 'Billed and received',
      show: can(session, 'money.view'),
      icon: <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
    },
    {
      href: '/sync',
      label: 'Sync',
      hint: 'Pending and refused',
      show: true,
      icon: <path d="M12 4a8 8 0 0 1 7.5 5M12 20a8 8 0 0 1-7.5-5M19.5 4v5h-5M4.5 20v-5h5" />,
    },
    {
      href: '/items',
      label: 'Items',
      hint: 'Rates and quantities',
      show: can(session, 'item.manage'),
      icon: <path d="M4 6h16M4 12h16M4 18h10" />,
    },
    {
      href: '/users',
      label: 'Staff',
      hint: 'Who can sign in',
      show: can(session, 'user.manage'),
      icon: (
        <path d="M9 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 9 11zm6.5 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zM2 19c0-2.8 3.1-4.5 7-4.5s7 1.7 7 4.5v1H2zm14.9 1H22v-1c0-1.9-1.5-3.2-3.6-3.9a5.9 5.9 0 0 1 1.5 3.9z" />
      ),
    },
  ].filter((tile) => tile.show);

  return (
    <Screen>
      <PageHeader
        title="More"
        subtitle={`${session.name} · ${session.role === 'super_admin' ? 'Super admin' : 'Admin'}`}
      />

      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="tap block">
            <Card className="flex h-full items-start gap-3 p-3.5 transition-colors hover:bg-paper">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-steel-soft text-steel">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  {tile.icon}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{tile.label}</span>
                <span className="block truncate text-xs text-ink-2">{tile.hint}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle>Session</SectionTitle>
      <SignOutButton />

      <p className="mt-6 text-xs text-ink-3">
        Message templates and settings will live here. The customer portal arrives with M6.
      </p>
    </Screen>
  );
}
