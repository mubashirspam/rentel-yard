'use client';

import { useLiveQuery } from 'dexie-react-hooks';

import { Button } from '@/components/ui/field';
import { Card, Chip, EmptyState, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { hasIndexedDb, yardDb, type OutboxRow, type RejectionRow } from '@/lib/sync/db';
import { discardRejected, retryRejected } from '@/lib/sync/outbox';
import { useSync } from '@/lib/sync/use-sync';
import { formatWhen } from '@/lib/format';

/**
 * §13 M5: "/sync screen: pending, rejected, force sync, last sync time."
 *
 * The honest-offline contract in one page. Nothing here is hidden or rounded-xl
 * off: if four gate passes are sitting on this phone, it says four, and it says
 * why the fifth was refused.
 */
export function SyncScreen() {
  const { online, pending, needsAttention, syncedAgo, lastSyncAt, syncing, forceSync } = useSync();

  // Live: the background drain empties this queue while the screen is open, and
  // the counts must follow without a refresh.
  const queued =
    useLiveQuery(
      () =>
        hasIndexedDb()
          ? yardDb().outbox.orderBy('queuedAt').toArray()
          : Promise.resolve([] as OutboxRow[]),
      [],
    ) ?? [];

  const rejected =
    useLiveQuery(
      () =>
        hasIndexedDb()
          ? yardDb().rejections.orderBy('rejectedAt').toArray()
          : Promise.resolve([] as RejectionRow[]),
      [],
    ) ?? [];

  return (
    <Screen>
      <PageHeader
        title="Sync"
        subtitle={
          online
            ? `Last synced ${syncedAgo}`
            : 'No connection. Work recorded here is safe and will send itself.'
        }
        action={
          <Chip tone={online ? (pending > 0 ? 'amber' : 'green') : 'amber'}>
            {online ? 'Online' : 'Offline'}
          </Chip>
        }
      />

      <Card className="p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-2">Pending</dt>
            <dd className="tabular text-2xl font-bold">{pending}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-2">Need attention</dt>
            <dd className={`tabular text-2xl font-bold ${needsAttention > 0 ? 'text-red' : ''}`}>
              {needsAttention}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-2">Last sync</dt>
            <dd className="text-sm font-medium">{lastSyncAt ? syncedAgo : 'never'}</dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={() => void forceSync()} disabled={syncing || !online}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>

        {!online && (
          <p className="mt-3 text-sm text-ink-2">
            Sync runs by itself the moment the signal comes back. Nothing is lost by closing the
            app — the queue lives on this phone, not in this tab.
          </p>
        )}
      </Card>

      <SectionTitle>Waiting to send</SectionTitle>
      {queued.length === 0 ? (
        <EmptyState title="Everything has landed">
          Work recorded on this phone is on the yard&apos;s server.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-rule">
            {queued.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{row.summary}</span>
                  <Chip tone={row.status === 'sending' ? 'steel' : 'amber'}>
                    {row.status === 'sending' ? 'sending' : 'queued'}
                  </Chip>
                </div>
                <p className="mt-0.5 text-xs text-ink-3">
                  {formatWhen(row.queuedAt)}
                  {row.attempts > 0 && ` · ${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`}
                  {row.lastError && ` · ${row.lastError}`}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionTitle>Needs attention</SectionTitle>
      {rejected.length === 0 ? (
        <EmptyState title="Nothing was refused">
          When the yard&apos;s server cannot accept something — a return larger than what is out,
          usually — it appears here with the reason.
        </EmptyState>
      ) : (
        <Card>
          <ul className="divide-y divide-rule">
            {rejected.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{row.summary}</span>
                  <Chip tone="red">refused</Chip>
                </div>
                <p className="mt-1 text-sm text-ink-2">{row.reason}</p>
                <p className="mt-0.5 text-xs text-ink-3">{formatWhen(row.rejectedAt)}</p>

                <div className="mt-2 flex flex-wrap gap-3">
                  <Button variant="secondary" onClick={() => void retryRejected(row.id)}>
                    Try again
                  </Button>
                  <Button variant="secondary" onClick={() => void discardRejected(row.id)}>
                    Discard
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 text-xs text-ink-3">
        Sending the same work twice is safe: every entry carries an id minted on this phone, and the
        server keeps only the first copy.
      </p>
    </Screen>
  );
}
