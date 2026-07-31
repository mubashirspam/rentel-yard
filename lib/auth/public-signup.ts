/**
 * Closing public sign-up (§05.1) without closing it to the server.
 *
 * Better Auth's `emailAndPassword.disableSignUp` is not a route-level switch:
 * it rejects the *operation*, so it also rejects `auth.api.signUpEmail()` called
 * server-side from `createUser` and from the seed script. With it on, nobody can
 * create a staff login at all — which is how this was shipped, and why the seed
 * failed the first time it met a real database.
 *
 * So sign-up stays enabled in the config, and the public HTTP path is blocked
 * here instead. A server-side call never traverses this route, so the one code
 * path that hashes passwords stays the one that verifies them.
 */

/** True when the request is an attempt to reach Better Auth's sign-up endpoint. */
export function isPublicSignUpAttempt(request: Request): boolean {
  const { pathname } = new URL(request.url);

  // Matches /api/auth/sign-up, /api/auth/sign-up/email, and any future variant,
  // while leaving /api/auth/sign-in alone.
  return /\/sign-up(\/|$)/.test(pathname);
}
