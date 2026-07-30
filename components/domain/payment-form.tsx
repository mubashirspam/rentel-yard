'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { newClientUuid, postJson } from '@/lib/api/client';
import { formatDayFull } from '@/lib/format';
import { receiptMessage } from '@/lib/messages';
import { formatPaise, rupeesToPaise } from '@/lib/money';
import { PAYMENT_METHODS } from '@/lib/validation/money';

import { Button, FormError, Select, TextInput } from '../ui/field';
import { Card, Chip } from '../ui/layout';
import { BigMoney, Money } from '../ui/money';
import { WhatsAppComposer } from './whatsapp-composer';

const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  cheque: 'Cheque',
  other: 'Other',
};

interface Result {
  amount: number;
  method: string;
  paidOn: string;
  allocatedToBills: number;
  unallocated: number;
}

/**
 * Records money the yard has already received (§09).
 *
 * There is no gateway and nothing is charged from here: the contractor hands
 * over cash or sends a UPI transfer, and this writes the receipt. Which bills
 * it settles is decided by the oldest-first rule, not by the admin — so two
 * people recording the same money reach the same answer.
 */
export function PaymentForm({
  accountId,
  siteName,
  customerName,
  customerMobile,
  yardName,
  balance,
  pendingOnBills,
  today,
}: {
  accountId: string;
  siteName: string;
  customerName: string;
  customerMobile: string;
  yardName: string;
  balance: number;
  pendingOnBills: number;
  today: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('cash');
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

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
      const payload = await postJson<{
        payment: { amount: number; method: string; paidOn: string };
        allocatedToBills: number;
        unallocated: number;
      }>('/api/payments', {
        accountId,
        amount: paise,
        method,
        paidOn,
        reference: reference.trim() === '' ? null : reference.trim(),
        remarks: remarks.trim() === '' ? null : remarks.trim(),
        clientUuid: newClientUuid(),
      });

      setResult({
        amount: payload.payment.amount,
        method: payload.payment.method,
        paidOn: payload.payment.paidOn,
        allocatedToBills: payload.allocatedToBills,
        unallocated: payload.unallocated,
      });
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const remaining = balance - result.amount;

    return (
      <section>
        <Card className="p-5">
          <Chip tone="green">Recorded</Chip>
          <div className="mt-3">
            <BigMoney paise={result.amount} tone="settled" />
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {METHOD_LABEL[result.method as keyof typeof METHOD_LABEL] ?? result.method} ·{' '}
            {formatDayFull(result.paidOn)} · {siteName}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-y-1 border-t border-rule pt-3 text-sm">
            <dt className="text-ink-2">Settled against bills</dt>
            <dd className="text-right">
              <Money paise={result.allocatedToBills} />
            </dd>
            {result.unallocated > 0 && (
              <>
                <dt className="text-ink-2">Held as advance</dt>
                <dd className="text-right">
                  <Money paise={result.unallocated} />
                </dd>
              </>
            )}
            <dt className="text-ink-2">Account balance now</dt>
            <dd className="text-right">
              <Money paise={remaining} />
            </dd>
          </dl>

          {result.unallocated > 0 && (
            <p className="mt-3 text-xs text-ink-3">
              More was paid than is currently billed. The surplus sits on the account and settles
              against the next bill automatically.
            </p>
          )}
        </Card>

        <div className="mt-4">
          <WhatsAppComposer
            mobile={customerMobile}
            title="Send a receipt"
            templates={[
              {
                id: 'receipt',
                label: 'Receipt',
                text: receiptMessage({
                  yardName,
                  customerName,
                  siteName,
                  amount: result.amount,
                  method: METHOD_LABEL[result.method as keyof typeof METHOD_LABEL] ?? result.method,
                  paidOn: result.paidOn,
                  balance: remaining,
                }),
              },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/accounts/${accountId}`}
            className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
          >
            Back to the account
          </Link>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setAmount('');
              setReference('');
              setRemarks('');
            }}
            className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
          >
            Record another
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormError>{error}</FormError>

      <Card className="mb-4 p-4">
        <p className="text-sm text-ink-2">
          {customerName} · {siteName}
        </p>
        <p className="mt-1 text-sm">
          Balance <Money paise={balance} className="font-medium" />
          {pendingOnBills > 0 && (
            <>
              {' · '}pending on bills <Money paise={pendingOnBills} className="font-medium" />
            </>
          )}
        </p>
      </Card>

      <TextInput
        id="payment-amount"
        label="Amount ₹"
        inputMode="decimal"
        required
        autoFocus
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
      />

      {pendingOnBills > 0 && amount.trim() === '' && (
        <button
          type="button"
          onClick={() => setAmount(formatPaise(pendingOnBills, { symbol: false }))}
          className="tap -mt-2 mb-4 px-1 text-sm font-medium text-steel"
        >
          Settle everything pending — {formatPaise(pendingOnBills)}
        </button>
      )}

      <Select
        id="payment-method"
        label="How was it paid?"
        value={method}
        onChange={(event) => setMethod(event.target.value as (typeof PAYMENT_METHODS)[number])}
      >
        {PAYMENT_METHODS.map((value) => (
          <option key={value} value={value}>
            {METHOD_LABEL[value]}
          </option>
        ))}
      </Select>

      <TextInput
        id="payment-date"
        label="Received on"
        type="date"
        max={today}
        value={paidOn}
        onChange={(event) => setPaidOn(event.target.value)}
      />
      <TextInput
        id="payment-reference"
        label="Reference (UPI id, cheque no.) — optional"
        value={reference}
        onChange={(event) => setReference(event.target.value)}
      />
      <TextInput
        id="payment-remarks"
        label="Remarks (optional)"
        value={remarks}
        onChange={(event) => setRemarks(event.target.value)}
      />

      <Button type="submit" disabled={busy || amount.trim() === ''}>
        {busy ? 'Recording…' : 'Record payment'}
      </Button>

      <p className="mt-3 text-xs text-ink-3">
        This records money the yard has already received. Nothing is collected here — the amount is
        applied to the oldest unpaid bill first.
      </p>
    </form>
  );
}
