'use client';

import { useEffect } from 'react';

import { mirrorState, refresh } from '@/lib/sync/mirror';

/**
 * Keeps the device's copy current, quietly (§07.1).
 *
 * Mounted on every admin screen, but it does not run on every navigation: a
 * first load fills the mirror, and after that it catches up only when the copy
 * is more than a couple of minutes old, or when the signal comes back. A phone
 * in a yard is on somebody's data plan.
 *
 * Failures are swallowed on purpose. This is a background convenience — if it
 * cannot reach the server, the outbox and the status chip are already telling
 * the truth about that, and a red banner over a working screen would not add
 * anything.
 */

const MIN_INTERVAL_MS = 120_000;

let inFlight: Promise<void> | null = null;
let lastAttempt = 0;

async function catchUp(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  const now = Date.now();
  if (!force && now - lastAttempt < MIN_INTERVAL_MS) return;

  const state = await mirrorState().catch(() => null);
  if (!state) return;

  // Never synced: fill it. Otherwise only if it has gone stale.
  const stale =
    !state.bootstrapped ||
    !state.lastSyncAt ||
    now - new Date(state.lastSyncAt).getTime() > MIN_INTERVAL_MS;

  if (!stale && !force) return;

  lastAttempt = now;
  inFlight = refresh()
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function SyncBoot() {
  useEffect(() => {
    const initial = window.setTimeout(() => void catchUp(), 0);
    const onOnline = () => void catchUp(true);

    window.addEventListener('online', onOnline);

    return () => {
      window.clearTimeout(initial);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
