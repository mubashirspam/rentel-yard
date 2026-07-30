/**
 * The fifth tab (§08.5). Everything that is not Home, Issue, Return, or
 * Accounts, shaped by capability so nobody taps into a 403.
 */

import { List, PageHeader, RowLink, Screen, SectionTitle } from '@/components/ui/layout';
import { can } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';

import { SignOutButton } from './sign-out';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function MorePage() {
  const session = await requirePageSession('/more');

  const links = [
    { href: '/customers', label: 'Customers', hint: 'Search, add, credit limits', show: can(session, 'customer.manage') },
    { href: '/payments/new', label: 'Record a payment', hint: 'Cash, UPI, bank, cheque', show: can(session, 'payment.create') },
    { href: '/stock', label: 'Stock', hint: 'Owned, out, available', show: can(session, 'movement.create') },
    { href: '/items', label: 'Items', hint: 'Rates and quantities owned', show: can(session, 'item.manage') },
    { href: '/users', label: 'Staff & roles', hint: 'Who can sign in', show: can(session, 'user.manage') },
  ].filter((link) => link.show);

  return (
    <Screen>
      <PageHeader
        title="More"
        subtitle={`${session.name} · ${session.role === 'super_admin' ? 'Super admin' : 'Admin'}`}
      />

      <List>
        {links.map((link) => (
          <li key={link.href}>
            <RowLink href={link.href}>
              <span className="font-medium">{link.label}</span>
              <span className="block text-sm text-ink-2">{link.hint}</span>
            </RowLink>
          </li>
        ))}
      </List>

      <SectionTitle>Session</SectionTitle>
      <SignOutButton />

      <p className="mt-6 text-xs text-ink-3">
        The offline queue arrives with M5 and the customer portal with M6.
      </p>
    </Screen>
  );
}
