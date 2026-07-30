'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { patchJson, postJson } from '@/lib/api/client';
import { rupeesToPaise } from '@/lib/money';

import { Button, FormError, TextInput } from '../ui/field';

/**
 * The customer register form (§01), used both to add and to edit.
 *
 * The credit limit is typed in rupees and converted here — the one place a
 * decimal string becomes money on the client (§00 rule 3). Zero means no limit.
 */

export interface CustomerFormValues {
  id?: string;
  name: string;
  mobile: string;
  altMobile: string;
  address: string;
  /** Rupees, as typed. */
  creditLimit: string;
  notes: string;
}

export const EMPTY_CUSTOMER: CustomerFormValues = {
  name: '',
  mobile: '',
  altMobile: '',
  address: '',
  creditLimit: '',
  notes: '',
};

export function CustomerForm({
  initial,
  submitLabel,
  onCancel,
}: {
  initial: CustomerFormValues;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function field(key: keyof CustomerFormValues) {
    return {
      value: form[key] ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [key]: event.target.value }),
    };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    let creditLimit: number;
    try {
      creditLimit = form.creditLimit.trim() === '' ? 0 : rupeesToPaise(form.creditLimit);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
      return;
    }

    const body = {
      name: form.name,
      mobile: form.mobile,
      altMobile: form.altMobile.trim() === '' ? null : form.altMobile,
      address: form.address.trim() === '' ? null : form.address,
      notes: form.notes.trim() === '' ? null : form.notes,
      creditLimit,
    };

    try {
      if (initial.id) {
        await patchJson(`/api/customers/${initial.id}`, body);
        router.refresh();
        onCancel?.();
      } else {
        const created = await postJson<{ customer: { id: string } }>('/api/customers', body);
        router.push(`/customers/${created.customer.id}`);
      }
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="rounded border border-rule bg-card p-5">
      <FormError>{error}</FormError>

      <TextInput id="customer-name" label="Name" required {...field('name')} />
      <TextInput
        id="customer-mobile"
        label="Mobile"
        type="tel"
        inputMode="numeric"
        required
        {...field('mobile')}
      />
      <TextInput
        id="customer-alt-mobile"
        label="Alternate mobile (optional)"
        type="tel"
        inputMode="numeric"
        {...field('altMobile')}
      />
      <TextInput id="customer-address" label="Address (optional)" {...field('address')} />
      <TextInput
        id="customer-credit-limit"
        label="Credit limit in ₹ (0 for none)"
        inputMode="decimal"
        {...field('creditLimit')}
      />
      <TextInput id="customer-notes" label="Notes (optional)" {...field('notes')} />

      <div className="flex gap-3">
        <Button type="submit" disabled={busy || !form.name.trim() || !form.mobile.trim()}>
          {busy ? 'Saving…' : submitLabel}
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
