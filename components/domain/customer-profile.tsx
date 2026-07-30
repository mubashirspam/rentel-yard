'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { patchJson } from '@/lib/api/client';
import { formatMobile } from '@/lib/format';
import { formatPaise } from '@/lib/money';

import { Button, FormError } from '../ui/field';
import { Card } from '../ui/layout';
import { CustomerForm, type CustomerFormValues } from './customer-form';

export interface CustomerProfileValues extends CustomerFormValues {
  id: string;
  isBlocked: boolean;
  /** Paise, for display beside the editable rupee figure. */
  creditLimitPaise: number;
}

/**
 * The profile block on /customers/[id]: read by default, editable on demand.
 *
 * Blocking is not deleting. §11 keeps a customer forever — movements reference
 * them — so a contractor the yard no longer serves is blocked, which stops new
 * sites being opened (see `openAccount`) and nothing else.
 */
export function CustomerProfile({ customer }: { customer: CustomerProfileValues }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function toggleBlocked() {
    setBusy(true);
    setError(undefined);

    try {
      await patchJson(`/api/customers/${customer.id}`, { isBlocked: !customer.isBlocked });
      router.refresh();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <CustomerForm
        initial={customer}
        submitLabel="Save changes"
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <Card className="p-4">
      <FormError>{error}</FormError>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-2">Mobile</dt>
        <dd>{formatMobile(customer.mobile)}</dd>

        {customer.altMobile && (
          <>
            <dt className="text-ink-2">Alternate</dt>
            <dd>{formatMobile(customer.altMobile)}</dd>
          </>
        )}

        {customer.address && (
          <>
            <dt className="text-ink-2">Address</dt>
            <dd>{customer.address}</dd>
          </>
        )}

        <dt className="text-ink-2">Credit limit</dt>
        <dd>{customer.creditLimitPaise > 0 ? formatPaise(customer.creditLimitPaise) : 'None set'}</dd>

        {customer.notes && (
          <>
            <dt className="text-ink-2">Notes</dt>
            <dd>{customer.notes}</dd>
          </>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit details
        </Button>
        <Button variant="secondary" onClick={toggleBlocked} disabled={busy}>
          {customer.isBlocked ? 'Unblock' : 'Block new sites'}
        </Button>
      </div>
    </Card>
  );
}
