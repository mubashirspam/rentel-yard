/**
 * The only place roles are defined (§05.3).
 *
 * Neon has no Supabase-style row policies, so authorisation lives in the
 * application. Do NOT scatter `if (role === 'admin')` through route handlers —
 * every check goes through `requireCapability` against this map.
 *
 * Two roles, per the build decision to drop `staff`:
 *   super_admin — everything, including item rates, users, billing settings
 *   admin       — the whole operational surface, including money
 *
 * Customers are not a role here. They never log in and never hold a session;
 * their read-only access is granted by a portal token (see `portal.ts`).
 */

import type { UserRole } from '../db/schema';

export const CAPS = {
  'movement.create': ['super_admin', 'admin'],
  'movement.reverse': ['super_admin', 'admin'],
  'customer.manage': ['super_admin', 'admin'],
  'account.manage': ['super_admin', 'admin'],
  'money.view': ['super_admin', 'admin'],
  'payment.create': ['super_admin', 'admin'],
  'bill.issue': ['super_admin', 'admin'],
  'adjustment.create': ['super_admin', 'admin'],
  'report.view': ['super_admin', 'admin'],
  'portal.share': ['super_admin', 'admin'],
  'item.manage': ['super_admin'],
  'user.manage': ['super_admin'],
  'settings.manage': ['super_admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export type Capability = keyof typeof CAPS;

export const ALL_CAPABILITIES = Object.keys(CAPS) as Capability[];

/** Pure predicate — no session, no I/O. The guard wraps this. */
export function roleHasCapability(role: UserRole, capability: Capability): boolean {
  return (CAPS[capability] as readonly UserRole[]).includes(role);
}

/** Every capability a role holds. Used to shape the client-side nav. */
export function capabilitiesFor(role: UserRole): Capability[] {
  return ALL_CAPABILITIES.filter((capability) => roleHasCapability(role, capability));
}
