'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { getJson, newClientUuid, postJson } from '@/lib/api/client';
import type { BillPreview } from '@/lib/bills/service';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';
import { rupeesToPaise } from '@/lib/money';

import { Button, FormError, Select, TextInput } from '../ui/field';
import { Segmented } from '../ui/segmented';
import { Card, Chip, SectionTitle } from '../ui/layout';
import { BigMoney, Money, Qty } from '../ui/money';

/**
 * §09 bill preview — "shows every line with an editable adjustments row".
 *
 * The preview is recomputed by the server on every change and again inside the
 * transaction that issues the bill: this screen sends a period and a due date,
 * never a total. A client that could name its own figure would be a client that
 * could bill a contractor whatever it liked.
 */
export function BillPreviewScreen({
  accountId,
  initial,
  today,
}: {
  accountId: string;
  initial: BillPreview;
  today: string;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState(initial);
  const [scope, setScope] = useState<'all' | 'returned'>('all');
  const [periodFrom, setPeriodFrom] = useState(initial.periodFrom);
  const [periodTo, setPeriodTo] = useState(initial.periodTo);
  const [dueOn, setDueOn] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(
    async (from: string, to: string, billScope: 'all' | 'returned' = 'all') => {
      setLoading(true);
      setError(undefined);
      try {
        const payload = await getJson<{ preview: BillPreview }>(
          `/api/bills?accountId=${accountId}&periodFrom=${from}&periodTo=${to}&scope=${billScope}`,
        );
        setPreview(payload.preview);
      } catch (failure) {
        setError((failure as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [accountId],
  );

  // Re-price whenever the period changes, so what is on screen is always what
  // would be issued.
  useEffect(() => {
    if (periodFrom === preview.periodFrom && periodTo === preview.periodTo) return;
    if (periodFrom > periodTo) return;

    const timer = setTimeout(() => void refresh(periodFrom, periodTo, scope), 250);
    return () => clearTimeout(timer);
  }, [periodFrom, periodTo, scope, preview.periodFrom, preview.periodTo, refresh]);

  async function issue() {
    setBusy(true);
    setError(undefined);

    try {
      const payload = await postJson<{ bill: { id: string } }>('/api/bills', {
        accountId,
        periodFrom,
        periodTo,
        scope,
        dueOn: dueOn === '' ? null : dueOn,
      });
      router.push(`/bills/${payload.bill.id}`);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  const empty =
    preview.lines.length === 0 &&
    preview.damageLines.length === 0 &&
    preview.adjustments.length === 0;

  return (
    <section>
      <FormError>{error}</FormError>

      {/* Bill the whole period, or only what has actually come back and can be
          invoiced as finished work. Equipment still on the site keeps accruing
          either way — the difference is whether this invoice charges for it now
          or the next one charges the whole run when it returns. */}
      <div className="mb-4">
        <Segmented
          options={[
            {
              href: '#all',
              label: 'Everything to date',
              active: scope === 'all',
            },
            {
              href: '#returned',
              label: 'Only what came back',
              active: scope === 'returned',
            },
          ]}
          onSelect={(index) => {
            const next = index === 0 ? 'all' : 'returned';
            setScope(next);
            void refresh(periodFrom, periodTo, next);
          }}
        />
        <p className="mt-1.5 text-xs text-ink-3">
          {scope === 'all'
            ? 'Includes rent running on equipment still at the site.'
            : 'Equipment still out is left off — it is billed in full when it comes back.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          id="period-from"
          label="Period from"
          type="date"
          value={periodFrom}
          max={periodTo}
          onChange={(event) => setPeriodFrom(event.target.value)}
        />
        <TextInput
          id="period-to"
          label="Period to"
          type="date"
          value={periodTo}
          max={today}
          onChange={(event) => setPeriodTo(event.target.value)}
        />
      </div>

      {preview.lastPeriodTo && (
        <p className="-mt-1 mb-4 text-sm text-ink-2">
          This account is billed to {formatDayFull(preview.lastPeriodTo)}. The next period starts the
          day after, so no day is charged twice.
        </p>
      )}

      {/* The ledger changed after an earlier bill was issued. Neither that bill
          (immutable) nor this one (its period starts later) can absorb it, so
          it has to be said out loud. */}
      {preview.earlierPeriodGap !== 0 && (
        <Card
          className={`mb-4 p-4 ${preview.earlierPeriodGap > 0 ? 'border-amber/30 bg-amber-soft' : 'border-green/30 bg-green-soft'}`}
        >
          <p className="font-medium">
            {preview.earlierPeriodGap > 0
              ? 'Rent from earlier periods was never billed'
              : 'Earlier bills charged for entries since reversed'}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            <Money paise={Math.abs(preview.earlierPeriodGap)} /> — something dated before{' '}
            {formatDayFull(periodFrom)} was recorded or reversed after that period was billed. Bills
            cannot be edited, so add {preview.earlierPeriodGap > 0 ? 'a charge' : 'a credit'}{' '}
            adjustment below to settle it on this one.
          </p>
        </Card>
      )}

      <SectionTitle aside={loading ? <span className="text-sm text-ink-3">pricing…</span> : undefined}>
        Rent
      </SectionTitle>

      {preview.lines.length === 0 ? (
        <Card className="p-4 text-sm text-ink-2">No rent accrued in this period.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-2">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-2 py-2 text-right font-semibold">Qty</th>
                <th className="px-2 py-2 text-right font-semibold">From</th>
                <th className="px-2 py-2 text-right font-semibold">To</th>
                <th className="px-2 py-2 text-right font-semibold">Days</th>
                <th className="px-2 py-2 text-right font-semibold">Rate</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {preview.lines.map((line, index) => (
                <tr key={`${line.lotId}-${index}`}>
                  <td className="px-3 py-2">
                    {line.itemName}
                    {line.daysBilledEarlier > 0 && (
                      <span className="block text-xs text-ink-3">
                        {formatDays(line.daysBilledEarlier)} already billed
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular">{line.qty}</td>
                  <td className="px-2 py-2 text-right tabular">{formatDay(line.from)}</td>
                  <td className="px-2 py-2 text-right tabular">
                    {line.to ? formatDay(line.to) : '(open)'}
                  </td>
                  <td className="px-2 py-2 text-right tabular">{line.days}</td>
                  <td className="px-2 py-2 text-right tabular">
                    <Money paise={line.ratePerDay} paiseDigits symbol={false} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money paise={line.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {preview.damageLines.length > 0 && (
        <>
          <SectionTitle>Damage and loss</SectionTitle>
          <Card>
            <ul className="divide-y divide-rule">
              {preview.damageLines.map((line) => (
                <li key={line.movementId} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    {line.type === 'LOST' ? 'Lost' : 'Damaged'}: {line.itemName} ×{' '}
                    <Qty qty={line.qty} /> @ <Money paise={line.unitCharge} />
                  </span>
                  <Money paise={line.amount} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle>Adjustments</SectionTitle>
      <AdjustmentsRow
        accountId={accountId}
        adjustments={preview.adjustments}
        periodFrom={periodFrom}
        periodTo={periodTo}
        today={today}
        onAdded={() => void refresh(periodFrom, periodTo)}
      />

      <div className="sticky bottom-16 mt-4 rounded-2xl border border-rule bg-card p-4">
        <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-2">Rent</dt>
          <dd className="text-right">
            <Money paise={preview.rentTotal} />
          </dd>
          {preview.damageTotal > 0 && (
            <>
              <dt className="text-ink-2">Damages</dt>
              <dd className="text-right">
                <Money paise={preview.damageTotal} />
              </dd>
            </>
          )}
          {preview.chargesTotal > 0 && (
            <>
              <dt className="text-ink-2">Charges</dt>
              <dd className="text-right">
                <Money paise={preview.chargesTotal} />
              </dd>
            </>
          )}
          {preview.creditsTotal > 0 && (
            <>
              <dt className="text-ink-2">Credits</dt>
              <dd className="text-right">
                <Money paise={-preview.creditsTotal} />
              </dd>
            </>
          )}
        </dl>

        <div className="mb-3 flex items-end justify-between gap-3 border-t border-rule pt-3">
          <span className="text-sm font-medium text-ink-2">Invoice total</span>
          <BigMoney paise={preview.grandTotal} />
        </div>

        <TextInput
          id="due-on"
          label="Due date (blank uses the yard's payment terms)"
          type="date"
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
        />

        <Button onClick={issue} disabled={busy || loading || empty}>
          {busy ? 'Issuing…' : 'Issue this bill'}
        </Button>

        <p className="mt-2 text-xs text-ink-3">
          Once issued, a bill cannot be edited or deleted. Corrections are a credit adjustment and a
          new bill.
        </p>
      </div>
    </section>
  );
}

/** §09's "editable adjustments row" — transport, a write-off, a correction. */
function AdjustmentsRow({
  accountId,
  adjustments,
  periodFrom,
  periodTo,
  today,
  onAdded,
}: {
  accountId: string;
  adjustments: BillPreview['adjustments'];
  periodFrom: string;
  periodTo: string;
  today: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'charge' | 'credit'>('charge');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [appliedOn, setAppliedOn] = useState(periodTo > today ? today : periodTo);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    let paise: number;
    try {
      paise = rupeesToPaise(amount);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
      return;
    }

    try {
      await postJson('/api/adjustments', {
        accountId,
        kind,
        amount: paise,
        reason,
        appliedOn,
        clientUuid: newClientUuid(),
      });
      setAmount('');
      setReason('');
      setOpen(false);
      onAdded();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      {adjustments.length === 0 ? (
        <p className="text-sm text-ink-2">Nothing added for this period.</p>
      ) : (
        <ul className="mb-3 divide-y divide-rule">
          {adjustments.map((adjustment) => (
            <li key={adjustment.id} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                {adjustment.reason}{' '}
                <Chip tone={adjustment.kind === 'credit' ? 'green' : 'neutral'}>
                  {adjustment.kind}
                </Chip>
                <span className="block text-xs text-ink-3">{formatDay(adjustment.appliedOn)}</span>
              </span>
              <Money paise={adjustment.kind === 'credit' ? -adjustment.amount : adjustment.amount} />
            </li>
          ))}
        </ul>
      )}

      <FormError>{error}</FormError>

      {open ? (
        <form onSubmit={submit} noValidate className="border-t border-rule pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              id="adjustment-kind"
              label="Kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as 'charge' | 'credit')}
            >
              <option value="charge">Charge — transport, labour, penalty</option>
              <option value="credit">Credit — discount, correction, write-off</option>
            </Select>
            <TextInput
              id="adjustment-amount"
              label="Amount ₹"
              inputMode="decimal"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <TextInput
              id="adjustment-reason"
              label="Reason (printed on the bill)"
              required
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <TextInput
              id="adjustment-date"
              label="Applied on"
              type="date"
              min={periodFrom}
              max={today}
              value={appliedOn}
              onChange={(event) => setAppliedOn(event.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={busy || !amount.trim() || !reason.trim()}>
              {busy ? 'Adding…' : 'Add adjustment'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Add an adjustment
        </Button>
      )}
    </Card>
  );
}
