/**
 * The single authorisation choke point (§05.2).
 *
 * Every route handler begins with exactly this shape:
 *
 *   const session = await requireSession();
 *   requireCapability(session, 'payment.create');   // throws 403
 *
 * Nothing else in the codebase may branch on `role` directly.
 */

import { headers } from 'next/headers';

import type { UserRole } from '../db/schema';
import { LedgerError, ERROR_CODES } from '../errors';
import { auth } from './auth';
import { roleHasCapability, type Capability } from './capabilities';

/** The authenticated staff member, reduced to what authorisation needs. */
export interface StaffSession {
  userId: string;
  orgId: string;
  role: UserRole;
  email: string;
  name: string;
}

export class UnauthorizedError extends LedgerError {
  constructor(message = 'Sign in to continue.') {
    super(ERROR_CODES.UNAUTHENTICATED, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends LedgerError {
  constructor(capability: Capability, role: UserRole) {
    super(ERROR_CODES.FORBIDDEN, 'You do not have permission to do that.', {
      context: { capability, role },
    });
    this.name = 'ForbiddenError';
  }
}

/**
 * Resolve the current staff session, or throw 401.
 *
 * A deactivated user is treated as signed out: §11 says a user is never
 * deleted, only deactivated, because movements reference them — so the row
 * survives but must stop granting access.
 */
export async function requireSession(): Promise<StaffSession> {
  const result = await auth().api.getSession({ headers: await headers() });
  const user = result?.user as
    | { id: string; email: string; name: string; orgId?: string; role?: string; isActive?: boolean }
    | undefined;

  if (!user) throw new UnauthorizedError();
  if (user.isActive === false) throw new UnauthorizedError('This account has been deactivated.');
  if (!user.orgId || !user.role) throw new UnauthorizedError('This account is not set up correctly.');

  return {
    userId: user.id,
    orgId: user.orgId,
    role: user.role as UserRole,
    email: user.email,
    name: user.name,
  };
}

/** Throws 403 unless the session's role holds `capability`. */
export function requireCapability(session: StaffSession, capability: Capability): void {
  if (!roleHasCapability(session.role, capability)) {
    throw new ForbiddenError(capability, session.role);
  }
}

/** Non-throwing variant, for shaping navigation and hiding dead-end buttons. */
export function can(session: StaffSession, capability: Capability): boolean {
  return roleHasCapability(session.role, capability);
}

/**
 * Guard a row that carries an `orgId`. Belt-and-braces against a query that
 * forgot its tenant filter — cheap now, essential the day this goes
 * multi-tenant (§00 rule 6).
 */
export function requireSameOrg(session: StaffSession, row: { orgId: string }): void {
  if (row.orgId !== session.orgId) {
    throw new LedgerError(ERROR_CODES.NOT_FOUND, 'Not found.', {
      context: { reason: 'cross-org access' },
    });
  }
}
