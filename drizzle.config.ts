import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read .env.local the way Next.js does. Load it when it
// exists (local runs); CI has no such file and sets the vars itself. Vars
// already in the environment win over the file.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

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
