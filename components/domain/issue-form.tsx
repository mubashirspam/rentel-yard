'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';

import { newClientUuid } from '@/lib/api/client';
import { mirrorStock } from '@/lib/sync/queries';
import { submitOrQueue } from '@/lib/sync/submit';
import type { CustomerSummary } from '@/lib/customers/service';
import { formatDayFull, formatMobile, waHref } from '@/lib/format';
import type { StockRow } from '@/lib/stock/service';

import { Button, FormError, TextInput } from '../ui/field';
import { Card, Chip, SectionTitle } from '../ui/layout';
import { Money, Qty } from '../ui/money';
import { QtyStepper } from '../ui/stepper';
import { AccountPicker } from './account-picker';
import { CustomerPicker } from './customer-picker';

/**
 * §08.3 — customer → account → date → items → confirm, in one commit.
 *
 * "The whole flow must complete in under 20 seconds for a repeat customer", so
 * each step collapses to a line of text as soon as it is answered, and arriving
 * from an account screen skips the first two entirely.
 */

export interface IssueTarget {
  accountId: string;
  siteName: string;
  customerName: string;
  customerMobile: string;
}

/** What §06 `POST /api/movements` answers with. */
interface BatchResponse {
  gatePassNo: string | null;
  negativeAvailability: Array<{ itemId: string; itemName: string; available: number }>;
}

/** What the receipt screen shows, once the batch has committed. */
interface Committed extends BatchResponse {
  movedAt: string;
  lines: Array<{ name: string; qty: number; unit: string }>;
  /** Recorded on the phone with no signal, waiting to be pushed (§07.5). */
  queued?: boolean;
}

export function IssueForm({
  items: serverItems,
  today,
  initialTarget,
}: {
  items: StockRow[];
  today: string;
  /** Set when the flow was entered from an account screen. */
  initialTarget?: IssueTarget;
}) {
  /*
   * The item list comes from the server when there is one. With no signal the
   * page arrives from the service worker cache with an empty list, and the same
   * shape is recomputed from the device's mirror instead — same `StockRow`, same
   * component, no second code path.
   */
  const mirrored = useLiveQuery(
    () => (serverItems.length === 0 ? mirrorStock() : Promise.resolve(undefined)),
    [serverItems.length],
  );
  const items = useMemo(
    () => (serverItems.length > 0 ? serverItems : (mirrored ?? [])),
    [serverItems, mirrored],
  );
  const [customer, setCustomer] = useState<{ id: string; name: string; mobile: string } | null>(
    initialTarget
      ? { id: '', name: initialTarget.customerName, mobile: initialTarget.customerMobile }
      : null,
  );
  const [target, setTarget] = useState<IssueTarget | null>(initialTarget ?? null);
  const [movedAt, setMovedAt] = useState(today);
  const [gatePassNo, setGatePassNo] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [committed, setCommitted] = useState<Committed | null>(null);

  const chosen = useMemo(
    () =>
      items
        .filter((item) => (quantities[item.id] ?? 0) > 0)
        .map((item) => ({ item, qty: quantities[item.id] })),
    [items, quantities],
  );

  const perDay = chosen.reduce((sum, line) => sum + line.qty * line.item.ratePerDay, 0);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const active = items.filter((item) => item.isActive || (quantities[item.id] ?? 0) > 0);
    if (!term) return active;
    return active.filter(
      (item) =>
        item.name.toLowerCase().includes(term) || (item.code ?? '').toLowerCase().includes(term),
    );
  }, [items, query, quantities]);

  async function commit() {
    if (!target) return;
    setBusy(true);
    setError(undefined);

    const payload = {
      accountId: target.accountId,
      type: 'ISSUE' as const,
      movedAt,
      gatePassNo: gatePassNo.trim() === '' ? null : gatePassNo.trim(),
      lines: chosen.map(({ item, qty }) => ({
        itemId: item.id,
        qty,
        clientUuid: newClientUuid(),
      })),
    };

    const lines = chosen.map(({ item, qty }) => ({ name: item.name, qty, unit: item.unit }));

    try {
      // §07.2: with no signal this returns as soon as the gate pass is durable
      // on the phone. The lorry does not wait for a network.
      const outcome = await submitOrQueue<BatchResponse>(
        '/api/movements',
        payload,
        {
          op: 'movement.batch',
          clientUuid: newClientUuid(),
          queuedAt: new Date().toISOString(),
          payload,
        },
        `Issued ${lines.map((line) => `${line.qty} × ${line.name}`).join(', ')}`,
      );

      setCommitted(
        outcome.status === 'applied'
          ? {
              gatePassNo: outcome.data.gatePassNo,
              movedAt,
              lines,
              negativeAvailability: outcome.data.negativeAvailability ?? [],
            }
          : {
              gatePassNo: payload.gatePassNo,
              movedAt,
              lines,
              negativeAvailability: [],
              queued: true,
            },
      );
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (committed && target) {
    return <IssueReceipt committed={committed} target={target} />;
  }

  // --- step 1: customer ----------------------------------------------------
  if (!customer) {
    return (
      <section>
        <SectionTitle>Who is taking it?</SectionTitle>
        <CustomerPicker onPick={(picked: CustomerSummary) => setCustomer(picked)} />
      </section>
    );
  }

  // --- step 2: site --------------------------------------------------------
  if (!target) {
    return (
      <section>
        <Answered label={customer.name} onChange={() => setCustomer(null)} />
        <SectionTitle>Which site?</SectionTitle>
        <AccountPicker
          customerId={customer.id}
          customerName={customer.name}
          today={today}
          onPick={(account) =>
            setTarget({
              accountId: account.id,
              siteName: account.siteName,
              customerName: customer.name,
              customerMobile: customer.mobile,
            })
          }
        />
      </section>
    );
  }

  // --- step 3: date and items ---------------------------------------------
  return (
    <section>
      <Answered
        label={`${target.customerName} · ${target.siteName}`}
        onChange={initialTarget ? undefined : () => setTarget(null)}
      />

      <FormError>{error}</FormError>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextInput
          id="issue-date"
          label="Issue date"
          type="date"
          max={today}
          value={movedAt}
          onChange={(event) => setMovedAt(event.target.value)}
        />
        <TextInput
          id="gate-pass"
          label="Gate pass no. (optional)"
          value={gatePassNo}
          onChange={(event) => setGatePassNo(event.target.value)}
        />
      </div>

      <SectionTitle aside={<span className="text-sm text-ink-2">availability is live</span>}>
        What is going out?
      </SectionTitle>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter items"
        aria-label="Filter items"
        className="tap mb-3 w-full rounded border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
      />

      <Card>
        <ul className="divide-y divide-rule">
          {visible.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.name}</p>
                <p className="text-sm text-ink-2">
                  <Money paise={item.ratePerDay} paiseDigits />
                  /day ·{' '}
                  {item.qtyAvailable > 0 ? (
                    <span className={item.isLow ? 'font-medium text-amber' : 'font-medium text-green'}>
                      <Qty qty={item.qtyAvailable} /> available
                    </span>
                  ) : (
                    <span className="font-medium text-red">none available</span>
                  )}
                </p>
              </div>
              <QtyStepper
                label={item.name}
                value={quantities[item.id] ?? 0}
                onChange={(qty) => setQuantities((all) => ({ ...all, [item.id]: qty }))}
              />
            </li>
          ))}
        </ul>
      </Card>

      {visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-2">Nothing matches “{query}”.</p>
      )}

      {/* §08.3: "running total of rent/day shown as items are added". */}
      <div className="sticky bottom-16 mt-4 rounded border border-rule bg-card p-4 shadow-sm">
        {chosen.length === 0 ? (
          <p className="text-sm text-ink-2">Add a quantity against an item to continue.</p>
        ) : (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-2">
                {chosen.length} {chosen.length === 1 ? 'item' : 'items'} · issued{' '}
                {formatDayFull(movedAt)}
              </span>
              <span className="font-semibold">
                <Money paise={perDay} paiseDigits />
                /day
              </span>
            </div>
            <Button onClick={commit} disabled={busy}>
              {busy ? 'Recording…' : `Issue ${chosen.reduce((sum, line) => sum + line.qty, 0)} units`}
            </Button>
          </>
        )}
      </div>

      {/* Issuing more than the yard owns is accepted, not blocked (§07.4) —
          but say so before the gate pass is signed. */}
      {chosen.some(({ item, qty }) => qty > item.qtyAvailable) && (
        <p className="mt-3 text-sm text-amber">
          That is more than the yard has available. It will be recorded — the equipment really is
          leaving — and flagged on the stock screen for reconciliation.
        </p>
      )}
    </section>
  );
}

function Answered({ label, onChange }: { label: string; onChange?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-rule bg-card px-4 py-2">
      <span className="truncate font-medium">{label}</span>
      {onChange && (
        <button type="button" onClick={onChange} className="tap px-2 text-sm font-medium text-steel">
          Change
        </button>
      )}
    </div>
  );
}

/** §08.3 result step — gate pass number, share on WhatsApp, print. */
function IssueReceipt({ committed, target }: { committed: Committed; target: IssueTarget }) {
  const summary = [
    `Yard Ledger — issued to ${target.siteName} on ${formatDayFull(committed.movedAt)}`,
    ...committed.lines.map((line) => `${line.qty} × ${line.name}`),
    committed.gatePassNo ? `Gate pass ${committed.gatePassNo}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <section>
      <Card className="p-5 print:border-0">
        {/* §07.5: a row that has not synced carries a marker. Do not hide it,
            and do not call it "Recorded" as though the yard's server has it. */}
        <div className="flex items-center gap-2">
          {committed.queued ? (
            <Chip tone="amber">Saved on this phone</Chip>
          ) : (
            <Chip tone="green">Recorded</Chip>
          )}
          {committed.gatePassNo && <span className="text-sm">Gate pass {committed.gatePassNo}</span>}
        </div>

        {committed.queued && (
          <p className="mt-2 text-sm text-ink-2">
            No signal. This gate pass is queued and will send itself — closing the app will not
            lose it.
          </p>
        )}

        <h2 className="mt-3 text-lg font-semibold">{target.siteName}</h2>
        <p className="text-sm text-ink-2">
          {target.customerName} · {formatMobile(target.customerMobile)} ·{' '}
          {formatDayFull(committed.movedAt)}
        </p>

        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {committed.lines.map((line) => (
            <li key={line.name} className="flex justify-between py-2">
              <span>{line.name}</span>
              <Qty qty={line.qty} unit={line.unit} />
            </li>
          ))}
        </ul>

        {committed.negativeAvailability.length > 0 && (
          <p className="mt-3 text-sm text-amber">
            {committed.negativeAvailability
              .map((row) => `${row.itemName} is ${row.available} in the yard`)
              .join(', ')}
            . More is out than the yard owns — reconcile it on the stock screen.
          </p>
        )}
      </Card>

      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        <a
          href={waHref(target.customerMobile, summary)}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
        >
          Share on WhatsApp
        </a>
        <PrintButton />
        <Link
          href={`/accounts/${target.accountId}`}
          className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
        >
          Open the account
        </Link>
        <Link
          href="/issue"
          className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
        >
          Issue again
        </Link>
      </div>
    </section>
  );
}

function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
    >
      Print
    </button>
  );
}
