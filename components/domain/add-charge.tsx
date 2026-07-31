'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { newClientUuid, postJson } from '@/lib/api/client';
import { rupeesToPaise } from '@/lib/money';

import { Button, FormError, Select, TextInput } from '../ui/field';
import { Card } from '../ui/layout';

/**
 * Everything that is not rent: transport, loading, labour, a negotiated
 * discount, a correction to a bill that can no longer be edited (§09).
 *
 * These existed only inside the bill preview, which meant a lorry charge could
 * be recorded on the day a bill happened to be raised and not on the day the
 * lorry ran. Now it belongs to the account, dated when it happened, and any
 * bill covering that date picks it up.
 */

/** The ones a yard actually types, so nobody spells "Transport" four ways. */
const COMMON = ['Transport', 'Loading', 'Unloading', 'Labour', 'Cleaning', 'Penalty'];

export function AddCharge({
  accountId,
  today,
}: {
  accountId: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'charge' | 'credit'>('charge');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [appliedOn, setAppliedOn] = useState(today);
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
        reason: reason.trim(),
        appliedOn,
        clientUuid: newClientUuid(),
      });

      setOpen(false);
      setReason('');
      setAmount('');
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add a charge
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} noValidate>
        <FormError>{error}</FormError>

        <Select
          id="charge-kind"
          label="What is it?"
          value={kind}
          onChange={(event) => setKind(event.target.value as 'charge' | 'credit')}
        >
          <option value="charge">Charge — transport, loading, labour, penalty</option>
          <option value="credit">Credit — discount, write-off, correction</option>
        </Select>

        {kind === 'charge' && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {COMMON.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className={`tap rounded-lg border px-3 text-sm font-semibold ${
                  reason === preset
                    ? 'border-steel bg-steel-soft text-steel'
                    : 'border-rule bg-card text-ink-2'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        )}

        <TextInput
          id="charge-reason"
          label="Reason (printed on the bill)"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <TextInput
          id="charge-amount"
          label="Amount ₹"
          inputMode="decimal"
          required
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <TextInput
          id="charge-date"
          label="Date"
          type="date"
          max={today}
          value={appliedOn}
          onChange={(event) => setAppliedOn(event.target.value)}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !reason.trim() || !amount.trim()}>
            {busy ? 'Adding…' : kind === 'charge' ? 'Add charge' : 'Add credit'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        <p className="mt-3 text-xs text-ink-3">
          Dated when it happened, not when it is billed. Any bill covering that date includes it.
        </p>
      </form>
    </Card>
  );
}
