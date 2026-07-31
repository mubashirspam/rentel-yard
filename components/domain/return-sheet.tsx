'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { OutstandingLine } from '@/lib/accounts/service';
import { newClientUuid } from '@/lib/api/client';
import { submitOrQueue } from '@/lib/sync/submit';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';

import { Button, FormError, TextInput } from '../ui/field';
import { Card, Chip, SectionTitle } from '../ui/layout';
import { Money, Qty } from '../ui/money';
import { QtyStepper } from '../ui/stepper';

/**
 * §08.3 fast return — the outstanding list with a quantity coming back against
 * each row.
 *
 * Condition is per line: good, damaged, or lost. The ledger has a movement type
 * for each and they price differently (§02), so a lorry arriving with 40 good
 * jacks and 4 broken ones is **two gate passes**, committed one after the other.
 * That is deliberate: a batch is atomic (§14), and merging the two would mean a
 * rejected damaged line silently discarding the good return the contractor just
 * watched being counted.
 */

type Condition = 'RETURN' | 'RETURN_DAMAGED' | 'LOST';

const CONDITIONS: Array<{
  value: Condition;
  label: string;
  hint: string;
  activeClass: string;
}> = [
  {
    value: 'RETURN',
    label: 'Good',
    hint: 'Back in the yard, rent stops',
    activeClass: 'border-green bg-green-soft text-green',
  },
  {
    value: 'RETURN_DAMAGED',
    label: 'Damaged',
    hint: 'Charged at the replacement rate',
    activeClass: 'border-amber bg-amber-soft text-amber',
  },
  {
    value: 'LOST',
    label: 'Lost',
    hint: 'Charged, and written off owned stock',
    activeClass: 'border-red bg-red-soft text-red',
  },
];

interface Draft {
  qty: number;
  condition: Condition;
}

interface Receipt {
  gatePasses: string[];
  lines: Array<{ name: string; qty: number; unit: string; condition: Condition }>;
  /** Held on the phone with no signal, waiting to be pushed (§07.5). */
  queued?: boolean;
}

export function ReturnSheet({
  accountId,
  siteName,
  customerName,
  outstanding,
  today,
  focusItemId,
}: {
  accountId: string;
  siteName: string;
  customerName: string;
  outstanding: OutstandingLine[];
  today: string;
  /** Set when the admin tapped a row on the account screen. */
  focusItemId?: string;
}) {
  const router = useRouter();

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    focusItemId
      ? { [focusItemId]: { qty: outstanding.find((l) => l.itemId === focusItemId)?.qtyOut ?? 0, condition: 'RETURN' } }
      : {},
  );
  const [movedAt, setMovedAt] = useState(today);
  const [gatePassNo, setGatePassNo] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const chosen = useMemo(
    () =>
      outstanding
        .map((line) => ({ line, draft: drafts[line.itemId] }))
        .filter((entry): entry is { line: OutstandingLine; draft: Draft } => (entry.draft?.qty ?? 0) > 0),
    [outstanding, drafts],
  );

  function update(itemId: string, patch: Partial<Draft>) {
    setDrafts((all) => ({
      ...all,
      [itemId]: { ...(all[itemId] ?? { qty: 0, condition: 'RETURN' }), ...patch },
    }));
  }

  async function commit() {
    setBusy(true);
    setError(undefined);

    const groups = CONDITIONS.map((condition) => ({
      type: condition.value,
      entries: chosen.filter((entry) => entry.draft.condition === condition.value),
    })).filter((group) => group.entries.length > 0);

    const gatePasses: string[] = [];
    const recorded: Receipt['lines'] = [];
    let queued = false;

    try {
      for (const group of groups) {
        // One gate pass per condition, suffixed when there is more than one, so
        // the paperwork and the ledger carry the same number.
        const number =
          gatePassNo.trim() === ''
            ? null
            : groups.length === 1
              ? gatePassNo.trim()
              : `${gatePassNo.trim()}-${group.type === 'RETURN' ? 'R' : group.type === 'RETURN_DAMAGED' ? 'D' : 'L'}`;

        const payload = {
          accountId,
          type: group.type,
          movedAt,
          gatePassNo: number,
          lines: group.entries.map((entry) => ({
            itemId: entry.line.itemId,
            qty: entry.draft.qty,
            clientUuid: newClientUuid(),
          })),
        };

        const outcome = await submitOrQueue(
          '/api/movements',
          payload,
          {
            op: 'movement.batch',
            clientUuid: newClientUuid(),
            queuedAt: new Date().toISOString(),
            payload,
          },
          `Returned ${group.entries
            .map((entry) => `${entry.draft.qty} × ${entry.line.itemName}`)
            .join(', ')}`,
        );

        if (outcome.status === 'queued') queued = true;

        if (number) gatePasses.push(number);
        for (const entry of group.entries) {
          recorded.push({
            name: entry.line.itemName,
            qty: entry.draft.qty,
            unit: entry.line.unit,
            condition: group.type,
          });
        }
      }

      setReceipt({ gatePasses, lines: recorded, queued });
      router.refresh();
    } catch (failure) {
      setError(
        recorded.length === 0
          ? (failure as Error).message
          : `${(failure as Error).message} The ${describe(recorded)} already recorded stayed — record the rest again.`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section>
        <Card className="p-5">
          {receipt.queued ? (
            <Chip tone="amber">Saved on this phone</Chip>
          ) : (
            <Chip tone="green">Recorded</Chip>
          )}
          <h2 className="mt-3 text-lg font-semibold">{siteName}</h2>
          <p className="text-sm text-ink-2">
            {customerName} · {formatDayFull(movedAt)}
            {receipt.gatePasses.length > 0 && ` · gate pass ${receipt.gatePasses.join(', ')}`}
          </p>

          {receipt.queued && (
            <p className="mt-2 text-sm text-ink-2">
              No signal. This return is queued and will send itself. If the equipment has already
              been returned by someone else, it will appear under Needs attention on /sync.
            </p>
          )}

          <ul className="mt-4 divide-y divide-rule border-y border-rule">
            {receipt.lines.map((line) => (
              <li key={`${line.name}-${line.condition}`} className="flex justify-between py-2">
                <span>
                  {line.name}
                  {line.condition !== 'RETURN' && (
                    <>
                      {' '}
                      <Chip tone={line.condition === 'LOST' ? 'red' : 'amber'}>
                        {line.condition === 'LOST' ? 'Lost' : 'Damaged'}
                      </Chip>
                    </>
                  )}
                </span>
                <Qty qty={line.qty} unit={line.unit} />
              </li>
            ))}
          </ul>
        </Card>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/accounts/${accountId}`}
            className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
          >
            Open the account
          </Link>
          <Link
            href="/return"
            className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
          >
            Another return
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <FormError>{error}</FormError>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          id="return-date"
          label="Return date"
          type="date"
          max={today}
          value={movedAt}
          onChange={(event) => setMovedAt(event.target.value)}
        />
        <TextInput
          id="return-gate-pass"
          label="Gate pass no. (optional)"
          value={gatePassNo}
          onChange={(event) => setGatePassNo(event.target.value)}
        />
      </div>

      <SectionTitle>What has come back?</SectionTitle>

      <Card>
        <ul className="divide-y divide-rule">
          {outstanding.map((line) => {
            const draft = drafts[line.itemId];
            return (
              <li key={line.itemId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.itemName}</p>
                    <p className="text-sm text-ink-2">
                      <Qty qty={line.qtyOut} unit={line.unit} /> out since {formatDay(line.since)} ·{' '}
                      {formatDays(line.daysHeld)}
                    </p>
                  </div>
                  <QtyStepper
                    label={line.itemName}
                    value={draft?.qty ?? 0}
                    max={line.qtyOut}
                    onChange={(qty) => update(line.itemId, { qty })}
                    hint={`/ ${line.qtyOut}`}
                  />
                </div>

                {(draft?.qty ?? 0) > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {CONDITIONS.map((condition) => {
                      const active = (draft?.condition ?? 'RETURN') === condition.value;
                      return (
                        <button
                          key={condition.value}
                          type="button"
                          title={condition.hint}
                          onClick={() => update(line.itemId, { condition: condition.value })}
                          aria-pressed={active}
                          className={`tap rounded-xl border px-3 text-sm font-semibold ${
                            active ? condition.activeClass : 'border-rule bg-card text-ink-2'
                          }`}
                        >
                          {condition.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="sticky bottom-16 mt-4 rounded border border-rule bg-card p-4 shadow-sm">
        {chosen.length === 0 ? (
          <p className="text-sm text-ink-2">Set a quantity against what has come back.</p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-2">
                {chosen.reduce((sum, entry) => sum + entry.draft.qty, 0)} units ·{' '}
                {formatDayFull(movedAt)}
              </span>
              <span className="text-sm text-ink-2">
                stops <Money paise={stoppedPerDay(chosen)} paiseDigits />
                /day
              </span>
            </div>
            <Button onClick={commit} disabled={busy}>
              {busy ? 'Recording…' : 'Record return'}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/** Rent this return takes off the daily accrual — the figure a contractor asks about. */
function stoppedPerDay(chosen: Array<{ line: OutstandingLine; draft: Draft }>): number {
  return chosen.reduce(
    (sum, entry) =>
      sum + Math.round((entry.line.accruingPerDay / entry.line.qtyOut) * entry.draft.qty),
    0,
  );
}

function describe(lines: Receipt['lines']): string {
  const kinds = new Set(lines.map((line) => (line.condition === 'RETURN' ? 'good' : 'damaged')));
  return [...kinds].join(' and ');
}
