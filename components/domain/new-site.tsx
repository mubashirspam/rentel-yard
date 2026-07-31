'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { postJson } from '@/lib/api/client';

import { Button, FormError, TextInput } from '../ui/field';
import { Card } from '../ui/layout';

/**
 * Opening a site for a customer you are already looking at.
 *
 * A contractor takes a second job and rings the yard. Until now the only way to
 * open that site was to start a delivery and create it mid-flow — fine when
 * equipment is going out today, useless when it is not, and impossible to find
 * if you were on the customer's page when they asked.
 *
 * Deliberately not part of the delivery flow: a site is a place, and it exists
 * whether or not anything has left the yard for it yet.
 */
export function NewSite({
  customerId,
  customerName,
  today,
}: {
  customerId: string;
  customerName: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [openedOn, setOpenedOn] = useState(today);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    try {
      const payload = await postJson<{ account: { id: string } }>('/api/accounts', {
        customerId,
        siteName,
        siteAddress: siteAddress.trim() === '' ? null : siteAddress.trim(),
        openedOn,
      });

      router.push(`/accounts/${payload.account.id}`);
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open a new site
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} noValidate>
        <p className="mb-3 text-sm text-ink-2">
          A new site for {customerName}. Each site keeps its own khata, so two jobs never merge into
          one balance nobody can argue with.
        </p>

        <FormError>{error}</FormError>

        <TextInput
          id="new-site-name"
          label="Site name"
          required
          autoFocus
          placeholder="e.g. Kakkanad flats"
          value={siteName}
          onChange={(event) => setSiteName(event.target.value)}
        />
        <TextInput
          id="new-site-address"
          label="Address (optional)"
          value={siteAddress}
          onChange={(event) => setSiteAddress(event.target.value)}
        />
        <TextInput
          id="new-site-opened"
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
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
