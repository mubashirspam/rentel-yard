'use client';

import { useState } from 'react';

import { getJson, postJson } from '@/lib/api/client';
import { mirrorCustomers } from '@/lib/sync/queries';
import type { CustomerSummary } from '@/lib/customers/service';
import { formatMobile } from '@/lib/format';

import { Button, FormError, TextInput } from '../ui/field';
import { Card } from '../ui/layout';

/**
 * §08.3 step 1 — "search or create inline (name + mobile is enough)".
 *
 * The contractor is standing there; a full customer form at this moment is how
 * the twenty-second issue becomes a two-minute one. Everything else about the
 * customer can be filled in later on /customers/[id].
 */
export function CustomerPicker({ onPick }: { onPick: (customer: CustomerSummary) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const payload = await getJson<{ customers: CustomerSummary[] }>(
        `/api/customers?q=${encodeURIComponent(query)}`,
      );
      setResults(payload.customers);
      setSearched(true);
    } catch (failure) {
      // With no signal, search the device's own copy. Balances are not in the
      // mirror, so those columns read zero — the picker only needs a name and a
      // number, and inventing a balance would be worse than omitting one.
      const offline = (failure as { code?: string }).code === 'OFFLINE';
      const local = offline ? await mirrorCustomers(query) : [];

      if (offline && local.length > 0) {
        setResults(
          local.map((row) => ({
            ...row,
            creditLimit: 0,
            openAccounts: 0,
            balance: 0,
            qtyOut: 0,
            overCreditLimit: false,
          })),
        );
        setSearched(true);
        setOffline(true);
      } else {
        setError((failure as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={search} className="mb-3 flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or mobile"
          aria-label="Search customers"
          className="tap w-full rounded border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
        />
        <button type="submit" disabled={busy} className="tap rounded bg-steel px-4 font-medium text-white">
          {busy ? '…' : 'Search'}
        </button>
      </form>

      <FormError>{error}</FormError>

      {offline && (
        <p className="mb-3 text-sm text-amber">
          No signal — searching this phone&apos;s copy. Balances are not shown offline.
        </p>
      )}

      {results.length > 0 && (
        <Card className="mb-3">
          <ul className="divide-y divide-rule">
            {results.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  onClick={() => onPick(customer)}
                  disabled={customer.isBlocked}
                  className="tap block w-full px-4 py-3 text-left hover:bg-paper disabled:opacity-50"
                >
                  <span className="font-medium">{customer.name}</span>
                  <span className="block text-sm text-ink-2">
                    {formatMobile(customer.mobile)}
                    {customer.openAccounts > 0 && ` · ${customer.openAccounts} open`}
                    {customer.isBlocked && ' · blocked'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {searched && results.length === 0 && !creating && (
        <p className="mb-3 text-sm text-ink-2">
          Nobody matches “{query}”. Add them — name and mobile is enough.
        </p>
      )}

      {creating ? (
        <NewCustomerForm
          initialName={query}
          onCancel={() => setCreating(false)}
          onCreated={onPick}
        />
      ) : (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          New customer
        </Button>
      )}
    </div>
  );
}

function NewCustomerForm({
  initialName,
  onCancel,
  onCreated,
}: {
  initialName: string;
  onCancel: () => void;
  onCreated: (customer: CustomerSummary) => void;
}) {
  // A number searched for is a number, not a name — don't prefill it as one.
  const [name, setName] = useState(/\d/.test(initialName) ? '' : initialName);
  const [mobile, setMobile] = useState(/^\d+$/.test(initialName.trim()) ? initialName.trim() : '');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const payload = await postJson<{ customer: { id: string; name: string; mobile: string } }>(
        '/api/customers',
        { name, mobile },
      );
      onCreated({
        ...payload.customer,
        isBlocked: false,
        creditLimit: 0,
        openAccounts: 0,
        balance: 0,
        qtyOut: 0,
        overCreditLimit: false,
      });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded border border-rule bg-card p-4">
      <FormError>{error}</FormError>

      <TextInput
        id="new-customer-name"
        label="Name"
        required
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <TextInput
        id="new-customer-mobile"
        label="Mobile"
        type="tel"
        inputMode="numeric"
        required
        value={mobile}
        onChange={(event) => setMobile(event.target.value)}
      />

      <div className="flex gap-3">
        <Button type="submit" disabled={busy || !name.trim() || !mobile.trim()}>
          {busy ? 'Adding…' : 'Add customer'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
