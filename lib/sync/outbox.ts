'use client';

/**
 * The write queue (§07.2).
 *
 * Steps 4 to 8 of the spec's write path, in one module:
 *
 *   4. Write to Dexie, flagged pending.
 *   5. Append to the outbox. The UI returns immediately — never await the
 *      network.
 *   6. A background drain empties it: on reconnect, on a 30s timer, and after
 *      every enqueue.
 *   7. The server upserts on `(org_id, client_uuid)`, so retries are free.
 *   8. 2xx → done. A business rejection → "needs attention", surfaced with the
 *      reason. A network or 5xx failure → stay queued, back off, retry forever.
 *
 * The distinction in step 8 is the one that matters. A rejected return is the
 * yard's problem and a human must look at it; a 500 is our problem and the
 * device should keep trying without bothering anybody.
 */

import { deviceId, hasIndexedDb, writeMeta, yardDb, type OutboxRow } from './db';
import type { SyncEntry, SyncPushResult } from './protocol';

/** Roughly 5s, 15s, 45s, 2m, 6m, then every 10 minutes. */
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 360_000];
const MAX_BACKOFF_MS = 600_000;
const BATCH_SIZE = 25;

const listeners = new Set<() => void>();

/** Subscribe to any change in queue state, for the status chip. */
export function onOutboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * Queue one mutation. Returns as soon as it is durable on the device — the
 * network is somebody else's problem.
 */
export async function enqueue(entry: SyncEntry, summary: string): Promise<void> {
  await yardDb().outbox.put({
    id: entry.clientUuid,
    op: entry.op,
    entry,
    status: 'pending',
    queuedAt: entry.queuedAt,
    attempts: 0,
    nextAttemptAt: 0,
    summary,
  });

  announce();
  void drain();
}

export interface DrainOutcome {
  attempted: number;
  applied: number;
  rejected: number;
  /** True when the drain stopped because the network is unreachable. */
  offline: boolean;
}

let draining = false;

/**
 * Push everything that is due.
 *
 * Serialised: a second call while one is in flight is a no-op, because two
 * drains would push the same entries twice. That is harmless on the server —
 * every write is idempotent — but it doubles the traffic on a phone with one
 * bar of signal.
 */
export async function drain(): Promise<DrainOutcome> {
  const idle: DrainOutcome = { attempted: 0, applied: 0, rejected: 0, offline: false };

  if (!hasIndexedDb() || draining) return idle;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ...idle, offline: true };
  }

  draining = true;

  try {
    const db = yardDb();
    const now = Date.now();

    const due = (await db.outbox.where('status').equals('pending').toArray())
      .filter((row) => row.nextAttemptAt <= now)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
      .slice(0, BATCH_SIZE);

    if (due.length === 0) return idle;

    await db.outbox.bulkPut(due.map((row) => ({ ...row, status: 'sending' as const })));
    announce();

    let response: Response;
    try {
      response = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: await deviceId(),
          entries: due.map((row) => row.entry),
        }),
      });
    } catch {
      await requeue(due, 'No connection.');
      return { ...idle, attempted: due.length, offline: true };
    }

    if (!response.ok) {
      // 401 included: the session expired while the phone was in a pocket.
      // Keep the work, back off, and let the admin sign in again.
      const message =
        response.status === 401
          ? 'Signed out. Sign in again to finish syncing.'
          : `The yard server answered ${response.status}.`;
      await requeue(due, message);
      return { ...idle, attempted: due.length };
    }

    const result = (await response.json()) as SyncPushResult;
    return await settle(due, result);
  } finally {
    draining = false;
    announce();
  }
}

/** Apply the server's verdict to each queued entry. */
async function settle(rows: OutboxRow[], result: SyncPushResult): Promise<DrainOutcome> {
  const db = yardDb();
  const byId = new Map(rows.map((row) => [row.id, row]));
  let applied = 0;
  let rejected = 0;

  for (const entry of result.results) {
    const row = byId.get(entry.clientUuid);
    if (!row) continue;

    if (entry.status === 'applied' && !entry.rejectedLines?.length) {
      await db.outbox.delete(row.id);
      applied += 1;
      continue;
    }

    // Either the whole entry was refused, or some of its lines were. Both need
    // a person, so both land in the same queue with the server's own wording.
    rejected += 1;
    await db.rejections.put({
      id: row.id,
      op: row.op,
      summary: row.summary,
      reason: entry.reason ?? entry.rejectedLines?.map((line) => line.reason).join(' ') ?? 'Refused.',
      code: entry.code ?? entry.rejectedLines?.[0]?.code ?? 'REJECTED',
      rejectedAt: new Date().toISOString(),
      entry: row.entry,
    });
    await db.outbox.delete(row.id);

    // A partly-applied gate pass still counts as landed for the lines that fit.
    if (entry.status === 'applied') applied += 1;
  }

  await writeMeta('cursor', String(result.cursor));
  await writeMeta('lastSyncAt', new Date().toISOString());

  return { attempted: rows.length, applied, rejected, offline: false };
}

async function requeue(rows: OutboxRow[], reason: string): Promise<void> {
  await yardDb().outbox.bulkPut(
    rows.map((row) => {
      const attempts = row.attempts + 1;
      return {
        ...row,
        status: 'pending' as const,
        attempts,
        lastError: reason,
        nextAttemptAt: Date.now() + (BACKOFF_MS[attempts - 1] ?? MAX_BACKOFF_MS),
      };
    }),
  );
}

/** Send a rejected entry back to the queue, after the admin corrected it. */
export async function retryRejected(id: string, replacement?: SyncEntry): Promise<void> {
  const db = yardDb();
  const rejection = await db.rejections.get(id);
  if (!rejection) return;

  await db.outbox.put({
    id: replacement?.clientUuid ?? rejection.id,
    op: rejection.op,
    entry: replacement ?? rejection.entry,
    status: 'pending',
    queuedAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: 0,
    summary: rejection.summary,
  });

  await db.rejections.delete(id);
  announce();
  void drain();
}

/** Give up on a rejection — the work was wrong and will not be resubmitted. */
export async function discardRejected(id: string): Promise<void> {
  await yardDb().rejections.delete(id);
  announce();
}

let started = false;

/**
 * Start the background drain: on reconnect, on tab focus, and every 30s.
 *
 * Background Sync would be tidier, but it is Chromium-only; a timer plus the
 * `online` event works on every phone the yard will actually hold.
 */
export function startBackgroundDrain(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  const kick = () => void drain();

  window.addEventListener('online', kick);
  window.addEventListener('focus', kick);
  const timer = window.setInterval(kick, 30_000);

  kick();

  return () => {
    window.removeEventListener('online', kick);
    window.removeEventListener('focus', kick);
    window.clearInterval(timer);
    started = false;
  };
}
