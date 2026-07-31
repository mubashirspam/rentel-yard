'use client';

import Link from 'next/link';

import { useSync } from '@/lib/sync/use-sync';

/**
 * §07.5: "Persistent status chip in the header: Online · Offline — 4 pending ·
 * Syncing… · 2 need attention."
 *
 * It is deliberately loud when there is something to say and almost invisible
 * when there is not. An admin should never have to wonder whether the gate pass
 * they just recorded actually left the phone.
 */
export function SyncChip() {
  const { online, pending, needsAttention, syncing, syncedAgo, ready } = useSync();

  if (!ready) return null;

  const { tone, label } = describe({ online, pending, needsAttention, syncing, syncedAgo });

  return (
    <Link
      href="/sync"
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-current' : 'bg-current opacity-60'}`}
      />
      {label}
    </Link>
  );
}

function describe(status: {
  online: boolean;
  pending: number;
  needsAttention: number;
  syncing: boolean;
  syncedAgo: string;
}): { tone: string; label: string } {
  // Worst news first: something needs a person.
  if (status.needsAttention > 0) {
    return {
      tone: 'bg-red-soft text-red',
      label: `${status.needsAttention} need${status.needsAttention === 1 ? 's' : ''} attention`,
    };
  }

  if (!status.online) {
    return {
      tone: 'bg-amber-soft text-amber',
      label: status.pending > 0 ? `Offline — ${status.pending} pending` : 'Offline',
    };
  }

  if (status.syncing) return { tone: 'bg-steel-soft text-steel', label: 'Syncing…' };

  if (status.pending > 0) {
    return { tone: 'bg-amber-soft text-amber', label: `${status.pending} pending` };
  }

  return { tone: 'bg-paper text-ink-3', label: `Synced ${status.syncedAgo}` };
}
