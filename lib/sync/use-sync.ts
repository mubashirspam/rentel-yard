'use client';

/**
 * One hook behind every honest-offline surface (§07.5).
 *
 * The status chip, the /sync screen, and the stale-data stamps all read from
 * here, so they can never disagree with each other about whether the yard is
 * online or how much work is waiting.
 */

import { useCallback, useEffect, useState } from 'react';

import { hasIndexedDb, yardDb } from './db';
import { drain, onOutboxChange, startBackgroundDrain } from './outbox';
import { mirrorState, refresh, staleness } from './mirror';

export interface SyncStatus {
  online: boolean;
  /** Entries waiting to be pushed. */
  pending: number;
  /** Entries the server refused — a person has to look at these. */
  needsAttention: number;
  lastSyncAt: string | null;
  /** "just now", "2h ago", "never synced". */
  syncedAgo: string;
  syncing: boolean;
  ready: boolean;
}

const INITIAL: SyncStatus = {
  online: true,
  pending: 0,
  needsAttention: 0,
  lastSyncAt: null,
  syncedAgo: 'never synced',
  syncing: false,
  ready: false,
};

export function useSync(): SyncStatus & { forceSync: () => Promise<void> } {
  const [status, setStatus] = useState<SyncStatus>(INITIAL);
  const [syncing, setSyncing] = useState(false);

  // Deferred a tick, so the first read never sets state synchronously inside
  // the effect that started it — which React flags as a cascading render.
  const read = useCallback(async () => {
    if (!hasIndexedDb()) return;
    await Promise.resolve();

    const db = yardDb();
    const [pending, needsAttention, state] = await Promise.all([
      db.outbox.count(),
      db.rejections.count(),
      mirrorState(),
    ]);

    setStatus({
      online: typeof navigator === 'undefined' ? true : navigator.onLine,
      pending,
      needsAttention,
      lastSyncAt: state.lastSyncAt,
      syncedAgo: staleness(state.lastSyncAt),
      syncing: false,
      ready: true,
    });
  }, []);

  useEffect(() => {
    // Scheduled rather than called: the queue is an external store, and the
    // first look at it belongs after this render, not inside it.
    const initial = window.setTimeout(() => void read(), 0);

    const stop = startBackgroundDrain();
    const unsubscribe = onOutboxChange(() => void read());

    const onNetwork = () => void read();
    window.addEventListener('online', onNetwork);
    window.addEventListener('offline', onNetwork);

    // The "2h ago" stamp has to age on its own, or a screen left open all
    // afternoon keeps claiming the data is fresh.
    const timer = window.setInterval(() => void read(), 60_000);

    return () => {
      stop();
      unsubscribe();
      window.removeEventListener('online', onNetwork);
      window.removeEventListener('offline', onNetwork);
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [read]);

  const forceSync = useCallback(async () => {
    setSyncing(true);
    try {
      await drain();
      await refresh();
    } finally {
      setSyncing(false);
      await read();
    }
  }, [read]);

  return { ...status, syncing: syncing || status.syncing, forceSync };
}
