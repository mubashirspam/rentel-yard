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
        orgId: { type: 'string', required: true, input: false },
        role: { type: 'string', required: true, input: false, defaultValue: 'admin' },
        isActive: { type: 'boolean', required: true, input: false, defaultValue: true },
      },
    },
    session: { modelName: 'authSessions' },
    account: { modelName: 'authAccounts' },
    verification: { modelName: 'authVerifications' },

    emailAndPassword: {
      enabled: true,
      // No self-signup (§05.1). Users are created by a super_admin through
      // /api/users, which calls the server-side sign-up API directly.
      disableSignUp: true,
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
