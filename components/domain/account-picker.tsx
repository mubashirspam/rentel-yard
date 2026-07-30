'use client';

import { useEffect, useState } from 'react';

import type { AccountListRow } from '@/lib/accounts/service';
import { getJson, postJson } from '@/lib/api/client';
import { formatDays } from '@/lib/format';

import { Button, FormError, TextInput } from '../ui/field';
import { Card } from '../ui/layout';
import { Money, Qty } from '../ui/money';

/**
 * §08.3 step 2 — "pick open account or create with a site name".
 *
 * A customer holds one khata per site, so this is the step that keeps a
 * contractor's two jobs from turning into one unarguable balance.
 */
export function AccountPicker({
  customerId,
  customerName,
  today,
  onPick,
}: {
  customerId: string;
  customerName: string;
  today: string;
  onPick: (account: Pick<AccountListRow, 'id' | 'siteName'>) => void;
}) {
  const [accounts, setAccounts] = useState<AccountListRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    getJson<{ accounts: AccountListRow[] }>(`/api/accounts?customerId=${customerId}&status=open`)
      .then((payload) => {
        if (cancelled) return;
        setAccounts(payload.accounts);
        // Straight to the site form when there is nothing to choose between.
        if (payload.accounts.length === 0) setCreating(true);
      })
      .catch((failure: Error) => {
        if (!cancelled) setError(failure.message);
      });

    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (accounts === null && !error) {
    return <p className="text-sm text-ink-2">Loading {customerName}’s sites…</p>;
  }

  return (
    <div>
      <FormError>{error}</FormError>

      {accounts && accounts.length > 0 && (
        <Card className="mb-3">
          <ul className="divide-y divide-rule">
            {accounts.map((account) => (
              <li key={account.id}>
                <button
                  type="button"
                  onClick={() => onPick(account)}
                  className="tap block w-full px-4 py-3 text-left hover:bg-paper"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{account.siteName}</span>
                    <Money paise={account.balance} />
                  </div>
                  <span className="text-sm text-ink-2">
                    <Qty qty={account.qtyOut} /> out · open {formatDays(account.daysOpen)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating ? (
        <NewSiteForm
          customerId={customerId}
          today={today}
          onCreated={onPick}
          onCancel={accounts && accounts.length > 0 ? () => setCreating(false) : undefined}
        />
      ) : (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          New site
        </Button>
      )}
    </div>
  );
}

function NewSiteForm({
  customerId,
  today,
  onCreated,
  onCancel,
}: {
  customerId: string;
  today: string;
  onCreated: (account: { id: string; siteName: string }) => void;
  onCancel?: () => void;
}) {
  const [siteName, setSiteName] = useState('');
  const [openedOn, setOpenedOn] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const payload = await postJson<{ account: { id: string; siteName: string } }>(
        '/api/accounts',
        { customerId, siteName, openedOn },
      );
      onCreated(payload.account);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded border border-rule bg-card p-4">
      <FormError>{error}</FormError>

      <TextInput
        id="site-name"
        label="Site name"
        required
        placeholder="e.g. Kakkanad flats"
        value={siteName}
        onChange={(event) => setSiteName(event.target.value)}
      />
      <TextInput
        id="opened-on"
        label="Opened on"
        type="date"
        max={today}
        value={openedOn}
        onChange={(event) => setOpenedOn(event.target.value)}
      />

      <div className="flex gap-3">
        <Button type="submit" disabled={busy || !siteName.trim()}>
          {busy ? 'Opening…' : 'Open site'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
