'use client';

/**
 * The device's own copy of the yard (§07.1).
 *
 * Dexie over IndexedDB, because it survives a force-quit — which is the exact
 * scenario §13's M5 criterion describes: record work with no signal, kill the
 * browser, reopen, reconnect, and nothing is lost.
 *
 * Two kinds of table live here and they must not be confused:
 *
 *  - **Mirror** tables (`items`, `customers`, `accounts`, `movements`,
 *    `payments`) are a read cache of server rows, replaced wholesale by the
 *    cursor pull. Never edit them expecting the change to reach the server.
 *  - **Outbox** and **rejections** are the device's own state: work that has
 *    not landed yet, and work the server refused.
 */

import Dexie, { type EntityTable } from 'dexie';

import type { SyncEntry, SyncOperation } from './protocol';

export type OutboxStatus = 'pending' | 'sending' | 'needs_attention';

export interface OutboxRow {
  /** The entry's `clientUuid` — its identity everywhere, device and server. */
  id: string;
  op: SyncOperation;
  entry: SyncEntry;
  status: OutboxStatus;
  queuedAt: string;
  attempts: number;
  /** Epoch ms before which no attempt should be made (exponential backoff). */
  nextAttemptAt: number;
  lastError?: string;
  /** A human-readable summary for the pending list, built when queued. */
  summary: string;
}

export interface RejectionRow {
  id: string;
  op: SyncOperation;
  summary: string;
  reason: string;
  code: string;
  rejectedAt: string;
  entry: SyncEntry;
}

export interface MetaRow {
  key: 'cursor' | 'lastSyncAt' | 'deviceId' | 'bootstrappedAt';
  value: string;
}

/** A mirrored server row. The shape is whatever the API returned. */
export interface MirrorRow {
  id: string;
  serverSeq: number;
  [key: string]: unknown;
}

class YardDatabase extends Dexie {
  items!: EntityTable<MirrorRow, 'id'>;
  customers!: EntityTable<MirrorRow, 'id'>;
  accounts!: EntityTable<MirrorRow, 'id'>;
  movements!: EntityTable<MirrorRow, 'id'>;
  payments!: EntityTable<MirrorRow, 'id'>;
  outbox!: EntityTable<OutboxRow, 'id'>;
  rejections!: EntityTable<RejectionRow, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('yard-ledger');

    this.version(1).stores({
      items: 'id, serverSeq, name',
      customers: 'id, serverSeq, mobile, name',
      accounts: 'id, serverSeq, customerId, status',
      movements: 'id, serverSeq, accountId, itemId, movedAt',
      payments: 'id, serverSeq, accountId, paidOn',
      outbox: 'id, status, queuedAt, nextAttemptAt',
      rejections: 'id, rejectedAt',
      meta: 'key',
    });
  }
}

let instance: YardDatabase | null = null;

/**
 * The database, created on first use.
 *
 * Lazy because this module is imported by components that also render on the
 * server, where `indexedDB` does not exist.
 */
export function yardDb(): YardDatabase {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is not available — this must run in the browser.');
  }
  if (!instance) instance = new YardDatabase();
  return instance;
}

export function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function readMeta(key: MetaRow['key']): Promise<string | null> {
  const row = await yardDb().meta.get(key);
  return row?.value ?? null;
}

export async function writeMeta(key: MetaRow['key'], value: string): Promise<void> {
  await yardDb().meta.put({ key, value });
}

/**
 * This device's stable id, minted once and kept.
 *
 * It travels with every push so a rejection can be shown on the device that
 * caused it, and so an admin looking at `sync_rejections` can tell which phone
 * in the yard needs attention.
 */
export async function deviceId(): Promise<string> {
  const existing = await readMeta('deviceId');
  if (existing) return existing;

  const minted =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  await writeMeta('deviceId', minted);
  return minted;
}

/** Wipe the mirror but keep the outbox — used by "force a full resync". */
export async function clearMirror(): Promise<void> {
  const db = yardDb();
  await db.transaction('rw', [db.items, db.customers, db.accounts, db.movements, db.payments, db.meta], async () => {
    await Promise.all([
      db.items.clear(),
      db.customers.clear(),
      db.accounts.clear(),
      db.movements.clear(),
      db.payments.clear(),
    ]);
    await db.meta.delete('cursor');
  });
}
