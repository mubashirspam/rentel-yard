/**
 * The fifth tab (§08.5). Everything that is not Home, Customers, Lend or
 * Stock, shaped by capability so nobody taps into a 403.
 *
 * Customers and Stock left this grid in the redesign — both are destinations in
 * their own right now, and a tile that duplicates a tab is a second way to the
 * same place that has to be learned before it can be ignored. Returns never had
 * a tile and no longer has a tab: a return starts by pointing at what is out, on
 * the screen of whoever is holding it.
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
      href: '/payments/new',
      label: 'Payment',
      hint: 'Record money received',
      show: can(session, 'payment.create'),
      icon: (
        <path d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
      ),
    },
    {
      href: '/return',
      label: 'Return',
      hint: 'When you know the site, not the name',
      show: can(session, 'movement.create'),
      icon: <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />,
    },
    {
      href: '/reports',
      label: 'Reports',
      hint: 'Billed and received',
      show: can(session, 'money.view'),
      icon: <path d="M4 20V10m5 10V4m5 16v-7m5 7V8" />,
    },
    {
      href: '/settings/messages',
      label: 'Messages',
      hint: 'WhatsApp language',
      show: true,
      icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
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
        The customer portal arrives with M6.
      </p>
    </Screen>
  );
}
