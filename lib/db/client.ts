/**
 * Database clients.
 *
 * Two connections, because they are good at different things:
 *
 *  - `db()`   Neon's serverless HTTP driver. One round trip per query, no pool
 *             to exhaust, survives the database auto-suspending when the yard
 *             is quiet (§12). Used for reads and single-statement writes.
 *  - `txDb()` Neon's WebSocket pool. Slower to open, but it is the only one
 *             that can hold an interactive transaction — and §14 requires every
 *             mutation to run in one.
 *
 * The HTTP driver cannot do read-then-write atomically, which is exactly what
 * validating a return needs: read the ledger, replay it, then insert only if
 * the return fits. Doing that over HTTP means two admins recording returns at
 * the same moment can both pass validation and drive outstanding below zero —
 * a state that then makes `accrue()` throw on every subsequent read and leaves
 * the account screen unopenable until someone reverses a movement by hand.
 */

import { neon, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool, type NeonDatabase } from 'drizzle-orm/neon-serverless';

import { serverEnv } from '../env';
import * as schema from './schema';

/**
 * The shape every query in the app is written against.
 *
 * Typed as the pool driver because it is the widest — it has `.transaction()`.
 * The HTTP driver and the PGlite test driver speak the same dialect and expose
 * the same query builder, so they are cast to this.
 */
export type Database = NeonDatabase<typeof schema>;

let readClient: Database | null = null;
let txClient: Database | null = null;
let pool: Pool | null = null;
let injected: Database | null = null;

/** Read client. Cheap, stateless, safe in any request handler. */
export function db(): Database {
  if (injected) return injected;
  if (!readClient) {
    readClient = drizzleHttp(neon(serverEnv().DATABASE_URL), {
      schema,
      casing: 'snake_case',
    }) as unknown as Database;
  }
  return readClient;
}

/**
 * Transaction-capable client. Use for anything that reads and then writes
 * based on what it read.
 */
export function txDb(): Database {
  if (injected) return injected;
  if (!txClient) {
    pool = new Pool({ connectionString: serverEnv().DATABASE_URL });
    txClient = drizzlePool(pool, { schema, casing: 'snake_case' });
  }
  return txClient;
}

/**
 * Run `work` inside a transaction.
 *
 * Serialisable isolation, because the invariant being protected is exactly the
 * kind Postgres's weaker levels allow through: two concurrent returns each
 * reading an outstanding quantity the other is about to consume. Retrying a
 * serialisation failure is the caller's business — at this volume it will not
 * happen, and a wrong balance is worse than an error message.
 */
export async function withTransaction<T>(
  work: (tx: Database) => Promise<T>,
): Promise<T> {
  return txDb().transaction(async (tx) => work(tx as unknown as Database), {
    isolationLevel: 'serializable',
  });
}

/**
 * Point every client at a test database. Test-only.
 *
 * Lets the services run unmodified against PGlite, so the M3 lifecycle test
 * exercises the same code path as production rather than a mock of it.
 */
export function __setTestDatabase(instance: unknown | null): void {
  injected = (instance as Database | null) ?? null;
  readClient = null;
  txClient = null;
}

/** Close the pool. Only useful in scripts; serverless never calls it. */
export async function closeConnections(): Promise<void> {
  await pool?.end();
  pool = null;
  txClient = null;
}

export { schema };
