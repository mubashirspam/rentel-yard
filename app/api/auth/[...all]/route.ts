import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/auth';
import { isPublicSignUpAttempt } from '@/lib/auth/public-signup';

// Better Auth needs the Node runtime — it hashes passwords with scrypt.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Built on first request, not at module load: `next build` collects page data
 * without the runtime environment, and validating DATABASE_URL there would
 * fail every build that is not running against a live database.
 */
let handlers: ReturnType<typeof toNextJsHandler> | null = null;

function resolve() {
  if (!handlers) handlers = toNextJsHandler(auth().handler);
  return handlers;
}

export function GET(request: Request) {
  return resolve().GET(request);
}

export function POST(request: Request) {
  // §05.1: customers never log in and staff are created by a super_admin, so
  // the public sign-up endpoint does not exist as far as the internet is
  // concerned. 404 rather than 403 — a 403 confirms the route is there.
  if (isPublicSignUpAttempt(request)) {
    return Promise.resolve(new Response('Not found', { status: 404 }));
  }

  return resolve().POST(request);
}
