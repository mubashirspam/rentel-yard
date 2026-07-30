/**
 * A real Postgres for tests, via PGlite (Postgres compiled to WASM).
 *
 * This applies the committed migration files verbatim — the same SQL that runs
 * against Neon — so a schema test proves the migration works rather than
 * proving a hand-written copy of it works. Test-only; never imported by app
 * code.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

import * as schema from './schema';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');

/** Statements in a drizzle migration are separated by this marker. */
const BREAKPOINT = '--> statement-breakpoint';

export interface TestDatabase {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  /** Throws if `sql` succeeds; returns the error message if it fails. */
  expectRejection(sql: string, params?: unknown[]): Promise<string>;
  /**
   * A drizzle client over the same database, to hand to `__setTestDatabase`.
   * Services then run completely unmodified — the lifecycle test exercises the
   * production code path rather than a re-implementation of it.
   */
  orm: unknown;
  close(): Promise<void>;
}

/** Boot an empty in-memory Postgres with every migration applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const pg = await PGlite.create();

  for (const file of migrationFiles()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of sql.split(BREAKPOINT)) {
      const trimmed = statement.trim();
      if (trimmed === '') continue;
      await pg.exec(trimmed);
    }
  }

  return {
    orm: drizzle(pg, { schema, casing: 'snake_case' }),
    async query<T>(sql: string, params?: unknown[]) {
      const result = await pg.query<T>(sql, params);
      return result.rows;
    },
    async exec(sql: string) {
      await pg.exec(sql);
    },
    async expectRejection(sql: string, params?: unknown[]) {
      try {
        await pg.query(sql, params);
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error(`Expected the database to reject this, but it succeeded:\n${sql}`);
    },
    async close() {
      await pg.close();
    },
  };
}

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}
