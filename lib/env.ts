/**
 * Environment variables, validated once and read through a typed accessor.
 *
 * Validation is lazy so that importing a module for a unit test does not
 * require a database URL to be present.
 */

import { z } from 'zod';

const serverSchema = z.object({
  /** Neon pooled connection string, used by request handlers. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  /** Direct connection, used by drizzle-kit migrations and the seed script. */
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.'),
  BETTER_AUTH_URL: z.url('BETTER_AUTH_URL must be an absolute URL.'),
  NEXT_PUBLIC_APP_URL: z.url('NEXT_PUBLIC_APP_URL must be an absolute URL.'),

  /** Mixed into the portal token hash so a leaked database is not enough. */
  PORTAL_TOKEN_PEPPER: z.string().min(16, 'PORTAL_TOKEN_PEPPER must be at least 16 characters.'),

  CRON_SECRET: z.string().min(16).optional(),

  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

/**
 * Parse and cache the server environment. Throws a readable list of problems
 * on the first call if anything is missing, rather than failing later with an
 * undefined connection string.
 */
export function serverEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment is not configured:\n${problems}`);
  }

  cached = parsed.data;
  return cached;
}

/** The connection string migrations and seeds should use. */
export function migrationUrl(): string {
  const env = serverEnv();
  return env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
}
