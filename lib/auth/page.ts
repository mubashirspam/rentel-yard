/**
 * Session plumbing for server components.
 *
 * Route handlers answer 401 with the §06 envelope; a page cannot — it has to
 * send the admin to the login screen and back again. `requirePageSession` is
 * the one place that translation happens, so no screen forgets the `next`
 * parameter and drops someone on the dashboard after signing in.
 */

import { notFound, redirect } from 'next/navigation';

import { isLedgerError, ERROR_CODES } from '../errors';
import { requireSession, UnauthorizedError, type StaffSession } from './guard';

export async function requirePageSession(next: string): Promise<StaffSession> {
  try {
    return await requireSession();
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect(`/login?next=${encodeURIComponent(next)}`);
    throw error;
  }
}

/**
 * Render Next's 404 for a row that is missing — or that belongs to another org,
 * which `requireSameOrg` also reports as not found (D22).
 */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isLedgerError(error) && error.code === ERROR_CODES.NOT_FOUND) notFound();
    throw error;
  }
}
