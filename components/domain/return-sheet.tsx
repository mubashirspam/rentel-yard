'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { OutstandingLine } from '@/lib/accounts/service';
import { newClientUuid } from '@/lib/api/client';
import { EMPTY_SPLIT, setSplit, splitTotal, type ReturnSplit } from '@/lib/returns/split';
import { mirrorOutstanding } from '@/lib/sync/queries';
import { submitOrQueue } from '@/lib/sync/submit';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';

import { Button, FormError, TextInput } from '../ui/field';
import { Card, Chip, SectionTitle } from '../ui/layout';
import { Money, Qty } from '../ui/money';

/**
 * §08.3 fast return — the outstanding list with what has come back against each
 * row.
 *
 * **One item splits three ways.** A lorry arrives with 42 jacks: 40 fine, one
 * bent, one never found. That is one row carrying three quantities, not a row
 * with a single condition — the earlier version forced the whole line to be
 * either good *or* damaged, so a split meant recording the same item twice and
 * hoping the quantities added up.
 *
 * The ledger has a movement type for each (§02) and they price differently, so
 * the three become up to three gate passes, committed one after another. That
 * is deliberate: a batch is atomic (§14), and merging them would let a rejected
 * damaged line silently discard the good return the contractor just watched
 * being counted.
 *
 * Quantities start filled to what is out, because the common case in a yard is
 * "everything is back" — adjusting one down beats counting all of them up. And
 * marking a unit damaged *moves* it out of good rather than adding to the
 * return: the lorry brought 42 either way.
 */

type Condition = 'RETURN' | 'RETURN_DAMAGED' | 'LOST';

/** Shared with `lib/returns/split.ts`, which is where the arithmetic is tested. */
type Draft = ReturnSplit;

const EMPTY = EMPTY_SPLIT;

const CONDITIONS: Array<{
  key: keyof Draft;
  type: Condition;
  label: string;
  tone: string;
  ring: string;
}> = [
  { key: 'good', type: 'RETURN', label: 'Good', tone: 'text-green', ring: 'bg-green-soft' },
  {
    key: 'damaged',
    type: 'RETURN_DAMAGED',
    label: 'Damaged',
    tone: 'text-amber',
    ring: 'bg-amber-soft',
  },
  { key: 'lost', type: 'LOST', label: 'Lost', tone: 'text-red', ring: 'bg-red-soft' },
];

interface Receipt {
  gatePasses: string[];
  lines: Array<{ name: string; qty: number; unit: string; condition: Condition }>;
  /** Held on the phone with no signal, waiting to be pushed (§07.5). */
  queued?: boolean;
}

const total = splitTotal;

export function ReturnSheet({
  accountId,
  siteName,
  customerName,
  outstanding: serverOutstanding,
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

  /*
   * With no signal the page comes from the service worker cache with nothing in
   * it, and the outstanding quantities are replayed from the device's mirror by
   * the same pure engine the server uses. Those quantities are what the return
   * is checked against locally — and the server checks them again when the
   * queue lands, which is why an over-return is a "needs attention" row rather
   * than a silent overwrite.
   */
  const mirrored = useLiveQuery(
    () =>
      serverOutstanding.length === 0
        ? mirrorOutstanding(accountId, today)
        : Promise.resolve(undefined),
    [accountId, today, serverOutstanding.length],
  );
  const outstanding = useMemo(
    () => (serverOutstanding.length > 0 ? serverOutstanding : (mirrored ?? [])),
    [serverOutstanding, mirrored],
  );

  // Null until the admin touches something: the counts shown before that are
  // derived from what is out, so they are right even when the outstanding list
  // arrives late from the mirror.
  const [drafts, setDrafts] = useState<Record<string, Draft> | null>(null);
  /*
   * Damaged and lost stay hidden until asked for. Most lorries bring
   * everything back whole, and two permanently-visible zero rows per item made
   * the common case pay a screen-height tax for the rare one. An item that
   * already carries a damaged or lost count shows its rows regardless — a
   * recorded number must never be invisible.
   */
  const [showDamage, setShowDamage] = useState<Record<string, boolean>>({});
  const [movedAt, setMovedAt] = useState(today);
  const [gatePassNo, setGatePassNo] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const filled = useMemo(() => {
    if (drafts) return drafts;

    // Prefilled to "all of it, in good condition". Arriving from a tapped row
    // on the account screen fills that item only.
    return Object.fromEntries(
      outstanding.map((line) => [
        line.itemId,
        !focusItemId || focusItemId === line.itemId
          ? { ...EMPTY, good: line.qtyOut }
          : { ...EMPTY },
      ]),
    );
  }, [drafts, outstanding, focusItemId]);

  const chosen = useMemo(
    () =>
      outstanding
        .map((line) => ({ line, draft: filled[line.itemId] ?? EMPTY }))
        .filter((entry) => total(entry.draft) > 0),
    [outstanding, filled],
  );

  const units = chosen.reduce((sum, entry) => sum + total(entry.draft), 0);
  const damagedUnits = chosen.reduce((sum, entry) => sum + entry.draft.damaged, 0);
  const lostUnits = chosen.reduce((sum, entry) => sum + entry.draft.lost, 0);

  /**
   * Moving a unit between conditions, not adding one.
   *
   * The load is already counted — 42 came back. Marking one damaged means that
   * unit is damaged *instead of* good, so a tap on Damaged+ takes one off Good
   * rather than making the return 43. Nobody should have to decrement one
   * column before incrementing another.
   *
   * The arithmetic lives in `lib/returns/split.ts` and is tested there: the
   * invariant it protects — the lorry brought what the lorry brought — is the
   * kind that goes wrong silently.
   */
  function set(itemId: string, key: keyof Draft, value: number, qtyOut: number) {
    setDrafts((all) => {
      const base = all ?? filled;
      return { ...base, [itemId]: setSplit(base[itemId] ?? EMPTY, key, value, qtyOut) };
    });
  }

  async function commit() {
    setBusy(true);
    setError(undefined);

    const groups = CONDITIONS.map((condition) => ({
      type: condition.type,
      entries: chosen
        .map((entry) => ({ line: entry.line, qty: entry.draft[condition.key] }))
        .filter((entry) => entry.qty > 0),
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
            qty: entry.qty,
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
            .map((entry) => `${entry.qty} × ${entry.line.itemName}`)
            .join(', ')}`,
        );

        if (outcome.status === 'queued') queued = true;

        if (number) gatePasses.push(number);
        for (const entry of group.entries) {
          recorded.push({
            name: entry.line.itemName,
            qty: entry.qty,
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
            className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-semibold text-white"
          >
            Open the account
          </Link>
          <Link
            href="/return"
            className="tap inline-flex items-center rounded-xl border border-rule bg-card px-4 py-2 font-semibold"
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

      <SectionTitle
        aside={<span className="text-sm text-ink-2">damaged and lost come out of good</span>}
      >
        What has come back?
      </SectionTitle>

      <ul className="space-y-2.5">
        {outstanding.map((line) => {
          const draft = filled[line.itemId] ?? EMPTY;
          const counted = total(draft);

          return (
            <li key={line.itemId}>
              <Card className="overflow-hidden">
                <div className="px-3 pt-2.5">
                  <p className="truncate font-semibold">{line.itemName}</p>

                  {/* What a worker checks before counting: how many are out,
                      since when, how long, what it costs a day. */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Chip tone="steel">
                      <Qty qty={line.qtyOut} unit={line.unit} /> out
                    </Chip>
                    <Chip>since {formatDay(line.since)}</Chip>
                    <Chip>{formatDays(line.daysHeld)}</Chip>
                    <Chip>
                      <Money paise={line.accruingPerDay} paiseDigits />
                      /day
                    </Chip>
                  </div>
                </div>

                <div className="mt-2 divide-y divide-rule border-t border-rule">
                  {CONDITIONS.filter(
                    (condition) =>
                      condition.key === 'good' ||
                      showDamage[line.itemId] ||
                      draft[condition.key] > 0,
                  ).map((condition) => (
                    <ConditionRow
                      key={condition.key}
                      label={condition.key === 'good' ? 'Returned' : condition.label}
                      tone={condition.tone}
                      ring={condition.ring}
                      value={draft[condition.key]}
                      // Damaged and Lost take from Good, so they need something
                      // to take; Good is bounded by what is still out.
                      canAdd={
                        condition.key === 'good'
                          ? counted < line.qtyOut
                          : draft.good > 0
                      }
                      onChange={(value) => set(line.itemId, condition.key, value, line.qtyOut)}
                    />
                  ))}

                  {!showDamage[line.itemId] && draft.damaged === 0 && draft.lost === 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowDamage((all) => ({ ...all, [line.itemId]: true }))
                      }
                      className="tap w-full px-3 py-1 text-left text-xs font-semibold text-ink-3 hover:text-ink"
                    >
                      + Damaged or lost?
                    </button>
                  )}
                </div>

                <p
                  className={`px-3 py-1.5 text-xs font-semibold ${
                    counted === line.qtyOut ? 'bg-green-soft text-green' : 'bg-paper text-ink-2'
                  }`}
                >
                  <span className="tabular">{counted}</span> of{' '}
                  <span className="tabular">{line.qtyOut}</span> returning
                  {counted < line.qtyOut && (
                    <span className="font-normal text-ink-3">
                      {' '}
                      · <span className="tabular">{line.qtyOut - counted}</span> staying out
                    </span>
                  )}
                </p>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-20 mt-4 rounded-2xl border border-rule bg-card p-4">
        {chosen.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing counted yet.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip tone="green">{units} coming back</Chip>
                {damagedUnits > 0 && <Chip tone="amber">{damagedUnits} damaged</Chip>}
                {lostUnits > 0 && <Chip tone="red">{lostUnits} lost</Chip>}
              </span>
              <span className="text-sm text-ink-2">
                stops <Money paise={stoppedPerDay(chosen)} paiseDigits />
                /day
              </span>
            </div>
            <Button onClick={commit} disabled={busy}>
              {busy ? 'Recording…' : `Record return of ${units}`}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * One quantity line, kept to a single row.
 *
 * No explanatory subtitle: "Damaged" needs no gloss to a yard worker, and two
 * lines per condition made a three-item return taller than a phone. The − and +
 * stay at 44px because §01's user is one-handed in a yard — that is the one
 * dimension not worth reclaiming.
 */
function ConditionRow({
  label,
  tone,
  ring,
  value,
  canAdd,
  onChange,
}: {
  label: string;
  tone: string;
  ring: string;
  value: number;
  canAdd: boolean;
  onChange: (value: number) => void;
}) {
  const active = value > 0;

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-1 ${active ? ring : ''}`}>
      <span className={`text-sm font-semibold ${active ? tone : 'text-ink-2'}`}>{label}</span>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`One fewer ${label.toLowerCase()}`}
          disabled={value <= 0}
          onClick={() => onChange(value - 1)}
          className="tap h-11 w-11 rounded-xl border border-rule bg-card text-xl font-semibold disabled:opacity-30"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label}
          value={value === 0 ? '' : String(value)}
          placeholder="0"
          onChange={(event) => onChange(Number(event.target.value.replace(/\D/g, '') || 0))}
          className={`tabular h-11 w-14 rounded-xl border border-rule bg-card text-center text-base font-semibold outline-none focus:border-steel focus:ring-2 focus:ring-steel/25 ${
            active ? tone : 'text-ink'
          }`}
        />
        <button
          type="button"
          aria-label={`One more ${label.toLowerCase()}`}
          disabled={!canAdd}
          onClick={() => onChange(value + 1)}
          className="tap h-11 w-11 rounded-xl border border-rule bg-card text-xl font-semibold disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Rent this return takes off the daily accrual — the figure a contractor asks about. */
function stoppedPerDay(chosen: Array<{ line: OutstandingLine; draft: Draft }>): number {
  return chosen.reduce(
    (sum, entry) =>
      sum + Math.round((entry.line.accruingPerDay / entry.line.qtyOut) * total(entry.draft)),
    0,
  );
}

function describe(lines: Receipt['lines']): string {
  const kinds = new Set(lines.map((line) => (line.condition === 'RETURN' ? 'good' : 'damaged')));
  return [...kinds].join(' and ');
}
