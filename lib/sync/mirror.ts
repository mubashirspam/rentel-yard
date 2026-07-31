'use client';

/**
 * Filling and refreshing the device's copy (§07.1, §07.3).
 *
 * Bootstrap once, then walk the cursor forward forever. Rows are `put`, never
 * merged field by field: the server's version of a row is always the truth, and
 * anything the device wanted to change is in the outbox, not the mirror.
 */

import { hasIndexedDb, readMeta, writeMeta, yardDb } from './db';
import type { MirroredTable, SyncPullResult } from './protocol';
import { MIRRORED_TABLES } from './protocol';

export interface MirrorState {
  cursor: number;
  lastSyncAt: string | null;
  bootstrapped: boolean;
}

export async function mirrorState(): Promise<MirrorState> {
  if (!hasIndexedDb()) return { cursor: 0, lastSyncAt: null, bootstrapped: false };

  const [cursor, lastSyncAt, bootstrappedAt] = await Promise.all([
    readMeta('cursor'),
    readMeta('lastSyncAt'),
    readMeta('bootstrappedAt'),
  ]);

  return {
    cursor: Number(cursor ?? 0),
    lastSyncAt,
    bootstrapped: bootstrappedAt !== null,
  };
}

/**
 * First load: pull the whole working set in one request.
 *
 * Only open accounts and their movements — a yard with three years of closed
 * sites should not be posting all of it to a phone over 3G.
 */
export async function bootstrap(): Promise<void> {
  const response = await fetch('/api/bootstrap');
  if (!response.ok) throw new Error(`Bootstrap failed (${response.status}).`);

  const payload = (await response.json()) as {
    cursor: number;
    serverTime: string;
    items: unknown[];
    customers: unknown[];
    accounts: unknown[];
    movements: unknown[];
  };

  const db = yardDb();

  await db.transaction(
    'rw',
    [db.items, db.customers, db.accounts, db.movements, db.meta],
    async () => {
      await Promise.all([
        db.items.clear(),
        db.customers.clear(),
        db.accounts.clear(),
        db.movements.clear(),
      ]);

      await Promise.all([
        db.items.bulkPut(payload.items as never[]),
        db.customers.bulkPut(payload.customers as never[]),
        db.accounts.bulkPut(payload.accounts as never[]),
        db.movements.bulkPut(payload.movements as never[]),
      ]);
    },
  );

  await writeMeta('cursor', String(payload.cursor));
  await writeMeta('lastSyncAt', payload.serverTime);
  await writeMeta('bootstrappedAt', payload.serverTime);
}

/**
 * Catch up from the stored cursor.
 *
 * Loops while the server says there is more, with a guard so a bug in the
 * cursor arithmetic cannot spin a phone's battery flat.
 */
export async function pull(): Promise<{ pulled: number }> {
  if (!hasIndexedDb()) return { pulled: 0 };

  const db = yardDb();
  let cursor = Number((await readMeta('cursor')) ?? 0);
  let pulled = 0;

  for (let page = 0; page < 50; page += 1) {
    const response = await fetch(`/api/sync/pull?cursor=${cursor}`);
    if (!response.ok) throw new Error(`Sync failed (${response.status}).`);

    const result = (await response.json()) as SyncPullResult;

    await db.transaction(
      'rw',
      [db.items, db.customers, db.accounts, db.movements, db.payments],
      async () => {
        for (const table of MIRRORED_TABLES) {
          const rows = result.changes[table] as never[];
          if (rows.length > 0) {
            await db[table].bulkPut(rows);
            pulled += rows.length;
          }
        }
      },
    );

    cursor = result.cursor;
    await writeMeta('cursor', String(cursor));
    await writeMeta('lastSyncAt', result.serverTime);

    if (!result.hasMore) break;
  }

  return { pulled };
}

/** Bootstrap if this device has never synced, otherwise catch up. */
export async function refresh(): Promise<void> {
  const state = await mirrorState();
  if (state.bootstrapped) await pull();
  else await bootstrap();
}

/** How stale the mirror is, for the §07.5 "as of" stamps. */
export function staleness(lastSyncAt: string | null, now = Date.now()): string {
  if (!lastSyncAt) return 'never synced';

  const minutes = Math.floor((now - new Date(lastSyncAt).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export type { MirroredTable };
