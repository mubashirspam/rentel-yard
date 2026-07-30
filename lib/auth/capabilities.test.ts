/**
 * §05.2 role matrix, as executable truth.
 *
 * The build dropped the `staff` role, so the surface is two roles: `admin` runs
 * the yard, `super_admin` additionally controls rates, users, and settings.
 */

import { describe, expect, it } from 'vitest';

import { ALL_CAPABILITIES, CAPS, capabilitiesFor, roleHasCapability } from './capabilities';

describe('the capability map', () => {
  it('grants a super_admin everything', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(roleHasCapability('super_admin', capability)).toBe(true);
    }
  });

  it('grants an admin the whole operational and money surface', () => {
    for (const capability of [
      'movement.create',
      'movement.reverse',
      'customer.manage',
      'account.manage',
      'money.view',
      'payment.create',
      'bill.issue',
      'adjustment.create',
      'report.view',
      'portal.share',
    ] as const) {
      expect(roleHasCapability('admin', capability)).toBe(true);
    }
  });

  it('reserves rates, users, and settings for a super_admin', () => {
    for (const capability of ['item.manage', 'user.manage', 'settings.manage'] as const) {
      expect(roleHasCapability('admin', capability)).toBe(false);
      expect(roleHasCapability('super_admin', capability)).toBe(true);
    }
  });

  it('lists every capability a role holds', () => {
    expect(capabilitiesFor('super_admin')).toEqual(ALL_CAPABILITIES);
    expect(capabilitiesFor('admin')).not.toContain('user.manage');
    expect(capabilitiesFor('admin').length).toBe(ALL_CAPABILITIES.length - 3);
  });

  it('names no role outside the two that exist', () => {
    // A stray 'staff' or 'customer' left in the map would silently grant access
    // to a role that can never hold a session.
    const named = new Set(Object.values(CAPS).flat());
    expect([...named].sort()).toEqual(['admin', 'super_admin']);
  });

  it('grants every capability to at least one role', () => {
    for (const capability of ALL_CAPABILITIES) {
      expect(CAPS[capability].length).toBeGreaterThan(0);
    }
  });
});
