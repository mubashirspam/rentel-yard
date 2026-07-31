'use client';

/**
 * The one entry point every write form uses (§07.2).
 *
 * Try the network; if it is not there, queue the work and tell the caller so.
 * Either way the form has an answer immediately and nothing the yard did is
 * lost — which is the whole point of the outbox.
 *
 * The queued entry is the *same shape* the online route accepts, so there is no
 * second definition of what a valid gate pass looks like: one Zod schema
 * validates it on the device and again on the server (§14).
 */

import { ApiError, postJson } from '../api/client';
import { enqueue } from './outbox';
import { hasIndexedDb } from './db';
import type { SyncEntry } from './protocol';

export type SubmitOutcome<T> =
  | { status: 'applied'; data: T }
  | { status: 'queued'; reason: string };

/**
 * @param url      The online route, e.g. `/api/movements`.
 * @param entry    The same mutation, shaped for the outbox.
 * @param summary  One line for the pending list: "Issued 100 × Jack 3.0m".
 */
export async function submitOrQueue<T>(
  url: string,
  body: unknown,
  entry: SyncEntry,
  summary: string,
): Promise<SubmitOutcome<T>> {
  // Already offline: do not make the user wait for a fetch that cannot succeed.
  if (typeof navigator !== 'undefined' && navigator.onLine === false && hasIndexedDb()) {
    await enqueue(entry, summary);
    return { status: 'queued', reason: 'No signal — saved on this phone.' };
  }

  try {
    return { status: 'applied', data: await postJson<T>(url, body) };
  } catch (error) {
    const failure = error as ApiError;

    // Only a transport failure is queueable. A business rejection means the
    // work is wrong and queueing it would just defer the same refusal — and a
    // 401 means signing in again, which the queue cannot do either.
    if (failure.code === 'OFFLINE' && hasIndexedDb()) {
      await enqueue(entry, summary);
      return { status: 'queued', reason: 'No signal — saved on this phone.' };
    }

    throw error;
  }
}
