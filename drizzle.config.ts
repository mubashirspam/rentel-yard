import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are generated offline, committed to the repo, and applied in CI
 * (§12). Uses the unpooled connection — drizzle-kit needs a real session.
 */
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
});
