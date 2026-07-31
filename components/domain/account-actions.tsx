'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson } from '@/lib/api/client';

import { Button, FormError } from '../ui/field';

/**
 * §08.2 actions — issue more, record a return, take a payment, raise a bill,
 * close the site. Sharing a signed statement link needs the portal (M6); the
 * WhatsApp composer further down the account screen covers it meanwhile.
 */
export function AccountActions({
  accountId,
  status,
  canClose,
  canBill,
  canPay,
  today,
}: {
  accountId: string;
  status: 'open' | 'closed';
  /** Everything is back, so §02 allows the account to be closed. */
  canClose: boolean;
  canBill: boolean;
  canPay: boolean;
  today: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function close() {
    setBusy(true);
    setError(undefined);

    try {
      await postJson(`/api/accounts/${accountId}/close`, { closedOn: today });
      setConfirming(false);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // A closed site can still owe money, so payments and bills stay available.
  if (status === 'closed') {
    return (
      <div>
        <p className="mb-3 text-sm text-ink-2">
          This site is closed. Nothing new can be issued, but money still moves.
        </p>
        <div className="flex flex-wrap gap-2">
          {canPay && (
            <Link
              href={`/payments/new?account=${accountId}`}
              className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
            >
              Record payment
            </Link>
          )}
          {canBill && (
            <Link
              href={`/accounts/${accountId}/bill`}
              className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
            >
              Generate bill
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <FormError>{error}</FormError>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/issue?account=${accountId}`}
          className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
        >
          Deliver more
        </Link>
        <Link
          href={`/return?account=${accountId}`}
          className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
        >
          Record return
        </Link>
        {canPay && (
          <Link
            href={`/payments/new?account=${accountId}`}
            className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
          >
            Record payment
          </Link>
        )}
        {canBill && (
          <Link
            href={`/accounts/${accountId}/bill`}
            className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
          >
            Generate bill
          </Link>
        )}

        {canClose &&
          (confirming ? (
            <span className="flex items-center gap-2">
              <Button onClick={close} disabled={busy}>
                {busy ? 'Closing…' : 'Confirm close'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Close site
            </Button>
          ))}
      </div>
    </div>
  );
}
