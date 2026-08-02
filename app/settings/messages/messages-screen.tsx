'use client';

import { useState } from 'react';

import { Button, FormError } from '@/components/ui/field';
import { Card, Chip, SectionTitle } from '@/components/ui/layout';
import { Segmented } from '@/components/ui/segmented';
import { patchJson } from '@/lib/api/client';
import {
  billMessage,
  receiptMessage,
  reminderMessage,
  statementMessage,
  type MessageLanguage,
} from '@/lib/messages';

/**
 * Choosing the language a contractor receives, with the actual templates on
 * screen underneath.
 *
 * A dropdown that says "Malayalam" and nothing else asks the yard to trust a
 * translation they have not read, in messages that go to people they do
 * business with. Every template is previewed with a worked example, so the
 * choice is made by reading it.
 */
export function MessagesScreen({
  initial,
  yardName,
  canEdit,
}: {
  initial: MessageLanguage;
  yardName: string;
  canEdit: boolean;
}) {
  const [language, setLanguage] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function choose(next: MessageLanguage) {
    setLanguage(next);
    setSaved(false);

    if (!canEdit) return;

    setBusy(true);
    setError(undefined);
    try {
      await patchJson('/api/settings', { messageLanguage: next });
      setSaved(true);
    } catch (failure) {
      setError((failure as Error).message);
      setLanguage(initial);
    } finally {
      setBusy(false);
    }
  }

  // One worked example, used for every preview, so the four can be compared.
  const sample = {
    yardName,
    customerName: 'Ibrahim',
    siteName: 'Kakkanad flats',
    language,
  };

  const previews = [
    {
      id: 'statement',
      label: 'Statement',
      hint: 'Sent from an account screen',
      text: statementMessage({
        ...sample,
        outstandingItems: [
          { itemName: 'Jack 3.0m', qtyOut: 100 },
          { itemName: 'Span 12ft', qtyOut: 40 },
        ],
        balance: 570_000,
        asOf: '2026-06-30',
      }),
    },
    {
      id: 'bill',
      label: 'Invoice',
      hint: 'Sent from a bill',
      text: billMessage({
        ...sample,
        invoiceNo: 'INV-2026-0042',
        periodFrom: '2026-06-01',
        periodTo: '2026-06-30',
        grandTotal: 1_570_000,
        outstanding: 570_000,
        dueOn: '2026-07-07',
      }),
    },
    {
      id: 'receipt',
      label: 'Receipt',
      hint: 'Sent after recording a payment',
      text: receiptMessage({
        ...sample,
        amount: 1_000_000,
        method: language === 'ml' ? 'UPI' : 'UPI',
        paidOn: '2026-07-05',
        balance: 570_000,
      }),
    },
    {
      id: 'reminder',
      label: 'Reminder',
      hint: 'Sent from the overdue queue',
      text: reminderMessage({
        ...sample,
        invoiceNo: 'INV-2026-0042',
        outstanding: 570_000,
        dueOn: '2026-07-07',
      }),
    },
  ];

  return (
    <div>
      <FormError>{error}</FormError>

      <Segmented
        options={[
          { href: '#en', label: 'English', active: language === 'en' },
          { href: '#ml', label: 'മലയാളം', active: language === 'ml' },
        ]}
        onSelect={(index) => void choose(index === 0 ? 'en' : 'ml')}
      />

      <p className="mt-2 text-sm text-ink-2">
        This is the language customers receive. The app itself stays in English.
        {busy && ' Saving…'}
        {saved && !busy && ' Saved.'}
      </p>

      {!canEdit && (
        <p className="mt-2 text-sm text-amber">
          Only a super admin can change this. You can still read the templates below.
        </p>
      )}

      <SectionTitle tone="steel">What a customer receives</SectionTitle>

      <ul className="space-y-2.5">
        {previews.map((preview) => (
          <li key={preview.id}>
            <Card className="p-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="font-semibold">{preview.label}</span>
                <Chip>{preview.hint}</Chip>
              </div>
              {/* Whitespace preserved: the line breaks are the message. */}
              <p className="whitespace-pre-wrap rounded-xl bg-paper p-3 text-sm leading-relaxed">
                {preview.text}
              </p>
            </Card>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-ink-3">
        Amounts and dates stay as ₹5,700 and 30-Jun-2026 in both languages — they read the same
        way to a contractor, and translating them would make them harder.
      </p>

      {canEdit && (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => void choose(language)} disabled={busy}>
            {busy ? 'Saving…' : 'Save again'}
          </Button>
        </div>
      )}
    </div>
  );
}
