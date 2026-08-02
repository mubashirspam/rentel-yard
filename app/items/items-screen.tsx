'use client';

import { useState } from 'react';

import { Button, FormError, TextInput } from '@/components/ui/field';
import { Card, Chip, SectionTitle } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { patchJson, postJson } from '@/lib/api/client';
import type { StockRow } from '@/lib/stock/service';
import { formatPaise, rupeesToPaise } from '@/lib/money';

/**
 * The item master (§01, super_admin only).
 *
 * Editing a rate here changes **future issues only** — every ISSUE carries its
 * own `rate_snapshot` (§02), so nothing already on a site is repriced. The
 * screen says so, because it is the assumption most likely to be wrong in
 * someone's head when they type a new number.
 */
export function ItemsScreen({ initialItems }: { initialItems: StockRow[] }) {
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);

  function replace(updated: StockRow) {
    setItems((all) => all.map((item) => (item.id === updated.id ? updated : item)));
  }

  return (
    <>
      <p className="mb-4 rounded-xl border border-rule bg-card p-4 text-sm text-ink-2">
        A rate change applies to equipment issued from now on. Anything already out keeps the rate it
        left the yard at, so no bill can change under a contractor.
      </p>

      <ul className="space-y-3">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} onChange={replace} />
        ))}
      </ul>

      <SectionTitle>Add an item</SectionTitle>
      {adding ? (
        <NewItemForm
          onCancel={() => setAdding(false)}
          onCreated={(item) => {
            setItems((all) => [...all, item]);
            setAdding(false);
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)}>New item</Button>
      )}
    </>
  );
}

function ItemRow({ item, onChange }: { item: StockRow; onChange: (item: StockRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [ratePerDay, setRatePerDay] = useState(formatPaise(item.ratePerDay, { symbol: false }));
  const [replacementRate, setReplacementRate] = useState(
    formatPaise(item.replacementRate, { symbol: false }),
  );
  const [qtyOwned, setQtyOwned] = useState(String(item.qtyOwned));
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);

    try {
      const payload = await patchJson<{ item: { isActive: boolean } }>(
        `/api/items/${item.id}`,
        patch,
      );
      onChange({
        ...item,
        ...patch,
        isActive: payload.item.isActive,
        // Availability is derived, so re-derive it rather than guessing.
        qtyAvailable:
          (patch.qtyOwned as number | undefined ?? item.qtyOwned) - item.qtyLost - item.qtyOut,
      } as StockRow);
      setEditing(false);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    let rates: { ratePerDay: number; replacementRate: number };
    try {
      rates = {
        ratePerDay: rupeesToPaise(ratePerDay),
        replacementRate: rupeesToPaise(replacementRate),
      };
    } catch (failure) {
      setError((failure as Error).message);
      return;
    }

    await save({ ...rates, qtyOwned: Number(qtyOwned) });
  }

  return (
    <li>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {item.name}
              {!item.isActive && (
                <>
                  {' '}
                  <Chip>Retired</Chip>
                </>
              )}
            </p>
            <p className="text-sm text-ink-2">
              <Money paise={item.ratePerDay} paiseDigits />
              /day · replacement <Money paise={item.replacementRate} /> · {item.qtyOwned} owned ·{' '}
              {item.qtyOut} out
            </p>
          </div>
          {!editing && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>

        <FormError>{error}</FormError>

        {editing && (
          <form onSubmit={submit} noValidate className="mt-4 border-t border-rule pt-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput
                id={`rate-${item.id}`}
                label="Rent ₹/day"
                inputMode="decimal"
                value={ratePerDay}
                onChange={(event) => setRatePerDay(event.target.value)}
              />
              <TextInput
                id={`replacement-${item.id}`}
                label="Replacement ₹"
                inputMode="decimal"
                value={replacementRate}
                onChange={(event) => setReplacementRate(event.target.value)}
              />
              <TextInput
                id={`owned-${item.id}`}
                label="Owned"
                inputMode="numeric"
                value={qtyOwned}
                onChange={(event) => setQtyOwned(event.target.value.replace(/\D/g, ''))}
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => save({ isActive: !item.isActive })}
              >
                {item.isActive ? 'Retire' : 'Bring back'}
              </Button>
            </div>

            {item.isActive && item.qtyOut > 0 && (
              <p className="mt-3 text-xs text-ink-3">
                {item.qtyOut} of these are on a site. Retiring only hides it from the issue screen —
                it stays returnable.
              </p>
            )}
          </form>
        )}
      </Card>
    </li>
  );
}

function NewItemForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (item: StockRow) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    unit: 'nos',
    ratePerDay: '',
    replacementRate: '',
    qtyOwned: '',
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    let rates: { ratePerDay: number; replacementRate: number };
    try {
      rates = {
        ratePerDay: rupeesToPaise(form.ratePerDay || '0'),
        replacementRate: rupeesToPaise(form.replacementRate || '0'),
      };
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
      return;
    }

    try {
      const payload = await postJson<{ item: StockRow }>('/api/items', {
        name: form.name,
        code: form.code.trim() === '' ? null : form.code.trim(),
        unit: form.unit.trim() === '' ? 'nos' : form.unit.trim(),
        qtyOwned: Number(form.qtyOwned || 0),
        ...rates,
      });

      onCreated({
        ...payload.item,
        qtyOut: 0,
        qtyLost: 0,
        qtyAvailable: Number(form.qtyOwned || 0),
        isNegative: false,
        isLow: false,
      });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  function field(key: keyof typeof form) {
    return {
      value: form[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setForm({ ...form, [key]: event.target.value }),
    };
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-rule bg-card p-5">
      <FormError>{error}</FormError>

      <TextInput id="new-item-name" label="Name" required {...field('name')} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput id="new-item-code" label="Short code (optional)" {...field('code')} />
        <TextInput id="new-item-unit" label="Unit" {...field('unit')} />
        <TextInput
          id="new-item-rate"
          label="Rent ₹/day"
          inputMode="decimal"
          required
          {...field('ratePerDay')}
        />
        <TextInput
          id="new-item-replacement"
          label="Replacement ₹"
          inputMode="decimal"
          {...field('replacementRate')}
        />
        <TextInput
          id="new-item-owned"
          label="Quantity owned"
          inputMode="numeric"
          {...field('qtyOwned')}
        />
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={busy || !form.name.trim()}>
          {busy ? 'Adding…' : 'Add item'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
