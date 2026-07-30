/**
 * User management (§11).
 *
 * A user is never deleted, only deactivated, because movements reference them
 * and the ledger's audit trail must keep resolving to a name.
 */

import { and, asc, eq, ne } from 'drizzle-orm';

import { auth } from '../auth/auth';
import type { StaffSession } from '../auth/guard';
import { db, schema } from '../db/client';
import type { UserRole } from '../db/schema';
import { LedgerError, ERROR_CODES } from '../errors';
import type { CreateUserInput, UpdateUserInput } from '../validation/users';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
}

export async function listUsers(session: StaffSession): Promise<StaffMember[]> {
  return db()
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.orgId, session.orgId))
    .orderBy(asc(schema.users.name));
}

/**
 * Create a staff login.
 *
 * Goes through Better Auth's sign-up API rather than inserting a row, so the
 * password is hashed by the same code path that later verifies it. Self-signup
 * stays disabled on the public endpoint (§05.1) — this is a server-side call
 * behind a `user.manage` check.
 */
export async function createUser(
  session: StaffSession,
  input: CreateUserInput,
): Promise<StaffMember> {
  const database = db();

  const [existing] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, input.email))
    .limit(1);

  if (existing) {
    throw new LedgerError(ERROR_CODES.CONFLICT, 'Someone already uses that email address.', {
      field: 'email',
    });
  }

  const created = await auth().api.signUpEmail({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
    },
  });

  if (!created?.user?.id) {
    throw new LedgerError(ERROR_CODES.CONFLICT, 'Could not create that user.', { field: 'email' });
  }

  // `orgId` and `role` are `input: false` on the Better Auth model, so they
  // cannot be set through sign-up. Assign them here, inside the guarded path.
  const [row] = await database
    .update(schema.users)
    .set({ orgId: session.orgId, role: input.role, isActive: true })
    .where(eq(schema.users.id, created.user.id))
    .returning({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    });

  return row;
}

/**
 * Change a role or deactivate an account.
 *
 * Refuses to strip the last active super_admin, which would lock the yard out
 * of item rates, user management, and billing settings with no way back in.
 */
export async function updateUser(
  session: StaffSession,
  userId: string,
  input: UpdateUserInput,
): Promise<StaffMember> {
  const database = db();

  const [target] = await database
    .select({
      id: schema.users.id,
      role: schema.users.role,
      isActive: schema.users.isActive,
    })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.orgId, session.orgId)))
    .limit(1);

  if (!target) throw new LedgerError(ERROR_CODES.NOT_FOUND, 'That user was not found.');

  const losesSuperAdmin =
    target.role === 'super_admin' &&
    ((input.role !== undefined && input.role !== 'super_admin') || input.isActive === false);

  if (losesSuperAdmin) {
    const others = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.orgId, session.orgId),
          eq(schema.users.role, 'super_admin'),
          eq(schema.users.isActive, true),
          ne(schema.users.id, userId),
        ),
      );

    if (others.length === 0) {
      throw new LedgerError(
        ERROR_CODES.CONFLICT,
        'This is the only active super admin. Promote someone else first.',
        { field: 'role' },
      );
    }
  }

  const [row] = await database
    .update(schema.users)
    .set({
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
      createdAt: schema.users.createdAt,
    });

  return row;
}
