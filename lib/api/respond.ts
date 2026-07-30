/**
 * Route-handler plumbing (§06, §14).
 *
 * Route handlers authenticate, validate, call a function in /lib, and
 * serialise. They contain no business logic and never leak a stack trace or a
 * raw Postgres error to a yard worker.
 */

import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

import { isLedgerError, LedgerError, ERROR_CODES } from '../errors';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Turn a thrown error into the §06 envelope.
 *
 * Anything that is not a `LedgerError` or a `ZodError` is an unexpected fault:
 * it is logged server-side and reported as a generic message, because the
 * alternative is putting a Postgres constraint name in front of a contractor.
 */
export function fail(error: unknown): NextResponse {
  if (isLedgerError(error)) {
    return NextResponse.json(error.toEnvelope(), { status: error.status });
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    const ledger = new LedgerError(ERROR_CODES.INVALID_CONFIG, first?.message ?? 'Check the form.', {
      field: first?.path.join('.'),
      context: { issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    });
    return NextResponse.json(ledger.toEnvelope(), { status: 400 });
  }

  console.error('Unhandled route error', error);

  return NextResponse.json(
    {
      error: {
        code: 'INTERNAL',
        message: 'Something failed on our side. Try again, and tell the yard if it keeps happening.',
      },
    },
    { status: 500 },
  );
}

/** Wrap a handler so every thrown `LedgerError` becomes a proper response. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

/** Parse a JSON body against a Zod schema, or throw a 400. */
export async function parseBody<S extends ZodType>(request: Request, schema: S): Promise<S['_output']> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new LedgerError(ERROR_CODES.INVALID_CONFIG, 'Expected a JSON body.');
  }
  return schema.parse(raw);
}

/** Best-effort client address, for rate limiting behind Vercel's proxy. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}
