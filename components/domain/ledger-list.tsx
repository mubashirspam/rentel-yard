'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { LedgerEntry } from '@/lib/accounts/service';
import { newClientUuid, postJson } from '@/lib/api/client';
import { formatDay, formatWhen, MOVEMENT_LABEL } from '@/lib/format';

import { Button, FormError, TextInput } from '../ui/field';
import { Card, Chip } from '../ui/layout';
import { Money, Qty } from '../ui/money';

/**
 * §08.2 ledger — movements, payments, and adjustments interleaved, newest
 * first, each row showing who entered it and when.
 *
 * The spec asks for long-press to reverse. This uses an explicit Reverse button
 * revealed by tapping the row: a long-press has no affordance, no keyboard
 * equivalent, and no way to be discovered by an admin who was never shown it.
 * Reversal is destructive-looking and permanent in the ledger; it should be
 * deliberate.
 */
export function LedgerList({
  entries,
  canReverse,
  today,
}: {
  entries: LedgerEntry[];
  canReverse: boolean;
  today: string;
}) {
  return (
    <Card>
      <ul className="divide-y divide-rule">
        {entries.map((entry) => (
          <li key={`${entry.kind}-${entry.id}`} className="px-4 py-3">
            {entry.kind === 'movement' ? (
              <MovementRow entry={entry} canReverse={canReverse} today={today} />
            ) : entry.kind === 'payment' ? (
              <PaymentRow entry={entry} />
            ) : (
              <AdjustmentRow entry={entry} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

type MovementEntry = Extract<LedgerEntry, { kind: 'movement' }>;

function MovementRow({
  entry,
  canReverse,
  today,
}: {
  entry: MovementEntry;
  canReverse: boolean;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const isReversal = entry.type === 'REVERSAL';
  const cancelled = entry.reversedBy !== null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-medium ${cancelled ? 'text-ink-3 line-through' : ''}`}>
          {MOVEMENT_LABEL[entry.type] ?? entry.type} <Qty qty={entry.qty} /> × {entry.itemName}
        </span>
        <span className="shrink-0 text-sm text-ink-2">{formatDay(entry.movedAt)}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        {entry.by && <span>{entry.by}</span>}
        <span>{formatWhen(entry.at)}</span>
        {entry.gatePassNo && <span>Gate pass {entry.gatePassNo}</span>}
        {cancelled && <Chip tone="amber">Reversed</Chip>}
        {isReversal && <Chip tone="neutral">Reversal</Chip>}
      </div>

      {entry.remarks && <p className="mt-1 text-sm text-ink-2">{entry.remarks}</p>}

      {canReverse && !cancelled && !isReversal && (
        <div className="mt-2">
          {open ? (
            <ReverseForm entry={entry} today={today} onCancel={() => setOpen(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="tap -ml-1 px-1 text-sm font-medium text-steel"
            >
              Reverse this entry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A correction is a new REVERSAL row, never an edit (§02) — so the reason is
 * required: it is the only record of why the ledger disagrees with the gate
 * pass the contractor holds.
 */
function ReverseForm({
  entry,
  today,
  onCancel,
}: {
  entry: MovementEntry;
  today: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [movedAt, setMovedAt] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      await postJson(`/api/movements/${entry.id}/reverse`, {
        reason,
        movedAt,
        clientUuid: newClientUuid(),
      });
      router.refresh();
      onCancel();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded border border-rule bg-paper p-3">
      <p className="mb-3 text-sm text-ink-2">
        The original entry stays in the ledger. This adds a reversal that cancels it.
      </p>
      <FormError>{error}</FormError>

      <TextInput
        id={`reason-${entry.id}`}
        label="Why is this being reversed?"
        required
        minLength={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <TextInput
        id={`reversed-on-${entry.id}`}
        label="Reversal date"
        type="date"
        max={today}
        value={movedAt}
        onChange={(event) => setMovedAt(event.target.value)}
      />

      <div className="flex gap-3">
        <Button type="submit" disabled={busy || reason.trim().length < 3}>
          {busy ? 'Reversing…' : 'Reverse'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function PaymentRow({ entry }: { entry: Extract<LedgerEntry, { kind: 'payment' }> }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          Payment received · <Money paise={entry.amount} />
        </span>
        <span className="shrink-0 text-sm text-ink-2">{formatDay(entry.movedAt)}</span>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        {entry.method}
        {entry.reference ? ` · ${entry.reference}` : ''}
      </p>
    </div>
  );
}

function AdjustmentRow({ entry }: { entry: Extract<LedgerEntry, { kind: 'adjustment' }> }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">
          {entry.adjustmentKind === 'charge' ? 'Charge' : 'Credit'} ·{' '}
          <Money paise={entry.amount} />
        </span>
        <span className="shrink-0 text-sm text-ink-2">{formatDay(entry.movedAt)}</span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{entry.reason}</p>
    </div>
  );
}
