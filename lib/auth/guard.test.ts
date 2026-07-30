/**
 * §13 M2 acceptance, adapted to the two-role build.
 *
 * The spec's criterion was "a staff-role user receives a 403 from
 * /api/payments". With `staff` dropped, the equivalent boundary is an `admin`
 * being refused the super_admin-only surface: item rates, users, settings.
 */

import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../errors';
import { can, ForbiddenError, requireCapability, requireSameOrg, type StaffSession } from './guard';

const admin: StaffSession = {
  userId: 'u-admin',
  orgId: 'org-1',
  role: 'admin',
  email: 'admin@yard.test',
  name: 'Yard Admin',
};

const superAdmin: StaffSession = { ...admin, userId: 'u-super', role: 'super_admin' };

describe('requireCapability', () => {
  it('lets an admin record payments and issue bills', () => {
    expect(() => requireCapability(admin, 'payment.create')).not.toThrow();
    expect(() => requireCapability(admin, 'bill.issue')).not.toThrow();
    expect(() => requireCapability(admin, 'movement.reverse')).not.toThrow();
  });

  it('refuses an admin the super_admin-only surface with a 403', () => {
    for (const capability of ['item.manage', 'user.manage', 'settings.manage'] as const) {
      try {
        requireCapability(admin, capability);
        expect.unreachable(`admin should not hold ${capability}`);
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenError);
        const forbidden = error as ForbiddenError;
        expect(forbidden.status).toBe(403);
        expect(forbidden.code).toBe(ERROR_CODES.FORBIDDEN);
        expect(forbidden.context).toMatchObject({ capability, role: 'admin' });
      }
    }
  });

  it('lets a super_admin through everywhere', () => {
    for (const capability of ['item.manage', 'user.manage', 'settings.manage'] as const) {
      expect(() => requireCapability(superAdmin, capability)).not.toThrow();
    }
  });

  it('does not leak why the check failed to the customer-facing message', () => {
    const error = new ForbiddenError('user.manage', 'admin');
    expect(error.message).toBe('You do not have permission to do that.');
    expect(error.message).not.toContain('user.manage');
  });
});

describe('can', () => {
  it('mirrors requireCapability without throwing, for shaping navigation', () => {
    expect(can(admin, 'payment.create')).toBe(true);
    expect(can(admin, 'user.manage')).toBe(false);
    expect(can(superAdmin, 'user.manage')).toBe(true);
  });
});

describe('requireSameOrg', () => {
  it('passes a row from the session’s own org', () => {
    expect(() => requireSameOrg(admin, { orgId: 'org-1' })).not.toThrow();
  });

  it('reports a cross-org row as not found, not as forbidden', () => {
    // 404 rather than 403: a 403 would confirm the row exists in some other org.
    try {
      requireSameOrg(admin, { orgId: 'org-2' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ForbiddenError).code).toBe(ERROR_CODES.NOT_FOUND);
      expect((error as ForbiddenError).status).toBe(404);
      expect((error as ForbiddenError).message).toBe('Not found.');
    }
  });
});
