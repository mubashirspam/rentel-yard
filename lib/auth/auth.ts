/**
 * Better Auth configuration (§05.1).
 *
 * Email + password, sessions in the database, HTTP-only cookies. No social
 * login and no self-signup — a super_admin creates users and assigns roles.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

import { db, schema } from '../db/client';
import { serverEnv } from '../env';

let cached: ReturnType<typeof build> | null = null;

function build() {
  const env = serverEnv();

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    /**
     * In development, also trust whatever origin the request came from.
     *
     * Testing on the actual phone is not optional for this product — §01's
     * user is standing in a yard holding one — and that means loading the dev
     * server over the LAN at `http://192.168.x.x:3000`, which is not
     * `BETTER_AUTH_URL`. Better Auth would otherwise refuse the sign-in as
     * coming from an untrusted origin.
     *
     * Production stays strict: only the configured URLs, so a phishing page on
     * another domain cannot drive this API with a stolen cookie.
     */
    trustedOrigins: (request) => {
      const configured = [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL];
      if (process.env.NODE_ENV !== 'development') return configured;

      const origin = request?.headers.get('origin');
      return origin ? [...configured, origin] : configured;
    },

    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: {
        users: schema.users,
        authSessions: schema.authSessions,
        authAccounts: schema.authAccounts,
        authVerifications: schema.authVerifications,
      },
    }),

    // The §04 tables are named for the domain. `accounts` is the customer
    // khata, so Better Auth's credential table is `auth_accounts` instead.
    user: {
      modelName: 'users',
      additionalFields: {
        // `org_id` is NOT NULL, so it has to be supplied at creation — Better
        // Auth's insert cannot leave it out and then have it patched in. It is
        // therefore the one additional field accepted as input; the public
        // sign-up route is a 404, so the only callers are `createUser` (behind
        // `user.manage`) and the seed script.
        orgId: { type: 'string', required: true, input: true },
        // The privilege-bearing fields stay unsettable from any payload. Even
        // if a sign-up call were ever reachable, it could not mint a
        // super_admin: `createUser` assigns the role afterwards, inside the
        // guard.
        role: { type: 'string', required: true, input: false, defaultValue: 'admin' },
        isActive: { type: 'boolean', required: true, input: false, defaultValue: true },
      },
    },
    session: { modelName: 'authSessions' },
    account: { modelName: 'authAccounts' },
    verification: { modelName: 'authVerifications' },

    emailAndPassword: {
      enabled: true,
      // NOT `disableSignUp: true`. That rejects the operation rather than the
      // route, so it also blocks `auth.api.signUpEmail()` — the call that
      // /api/users and the seed script use to create staff. §05.1's "no
      // self-signup" is enforced on the public path instead, in
      // `public-signup.ts`, which the auth route consults before handing over.
      minPasswordLength: 10,
    },

    advanced: {
      database: {
        // Let Postgres mint uuids via gen_random_uuid() rather than having
        // Better Auth generate string ids, so every table's pk is a real uuid.
        generateId: false,
      },
    },

    plugins: [nextCookies()],
  });
}

/** Lazily built so importing this module in a unit test needs no environment. */
export function auth() {
  if (!cached) cached = build();
  return cached;
}

export type Auth = ReturnType<typeof build>;
