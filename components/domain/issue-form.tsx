'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';

import { newClientUuid, postJson } from '@/lib/api/client';
import { mirrorStock } from '@/lib/sync/queries';
import { submitOrQueue } from '@/lib/sync/submit';
import { formatDay, formatDayFull, formatDays, formatMobile, waHref } from '@/lib/format';
import type { StockRow } from '@/lib/stock/service';

import { Button, FormError, TextInput } from '../ui/field';
import { Card, Chip, SectionTitle } from '../ui/layout';
import { Money, Qty } from '../ui/money';
import { QtyStepper } from '../ui/stepper';

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
  /** What the site already holds, when the flow was entered from an account. */
  outstanding?: Array<{
    itemName: string;
    qtyOut: number;
    unit: string;
    since: string;
    daysHeld: number;
    accruingPerDay: number;
  }>;
  balance?: number;
  openedOn?: string;
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

/** An open khata, ready to be lent to. Rendered with the page — no fetch. */
export interface LendTarget {
  accountId: string;
  customerId: string;
  siteName: string;
  customerName: string;
  customerMobile: string;
  qtyOut: number;
}

export function IssueForm({
  items: serverItems,
  today,
  initialTarget,
  targets = [],
}: {
  items: StockRow[];
  today: string;
  /** Set when the flow was entered from an account screen. */
  initialTarget?: IssueTarget;
  /** Every open khata, for the picker at the top of the form. */
  targets?: LendTarget[];
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

  /*
   * One page, not three screens.
   *
   * The old flow was customer → site → items, each replacing the last. For a
   * repeat customer — §08.3's twenty-second lending — that is two navigations
   * before anything can be counted, and no way to see what you picked while
   * picking the rest. Now the target sits at the top of the same page the items
   * are on: choose, and it collapses to a line; tap Change and it opens again.
   */
  return (
    <section>
      <SectionTitle tone="steel">Choose or add customer</SectionTitle>

      {target ? (
        <Answered
          label={`${target.customerName} · ${target.siteName}`}
          onChange={initialTarget ? undefined : () => setTarget(null)}
        />
      ) : (
        <TargetPicker
          targets={targets}
          today={today}
          onPick={(picked) => {
            setTarget({
              accountId: picked.accountId,
              siteName: picked.siteName,
              customerName: picked.customerName,
              customerMobile: picked.customerMobile,
            });
          }}
        />
      )}

      {target?.outstanding && target.outstanding.length > 0 && (
        <>
          <SectionTitle tone="amber">Already on this site</SectionTitle>
          <Card>
            <ul className="divide-y divide-rule">
              {target.outstanding.map((line) => (
                <li key={line.itemName} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{line.itemName}</span>
                    <span className="font-semibold">
                      <Qty qty={line.qtyOut} unit={line.unit} />
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Chip>since {formatDay(line.since)}</Chip>
                    <Chip>{formatDays(line.daysHeld)}</Chip>
                    <Chip tone="amber">
                      <Money paise={line.accruingPerDay} paiseDigits />
                      /day
                    </Chip>
                  </div>
                </li>
              ))}
            </ul>
            {target.balance !== undefined && (
              <p className="border-t border-rule px-4 py-2 text-sm text-ink-2">
                Balance on this site <Money paise={target.balance} className="font-semibold" />
              </p>
            )}
          </Card>
        </>
      )}

      <FormError>{error}</FormError>

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
          {visible.map((item) => {
            const qty = quantities[item.id] ?? 0;

            return (
              <li
                key={item.id}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 ${
                  qty > 0 ? 'bg-steel-soft/40' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>

                  {/* Rate and availability as chips: the two facts that decide
                      whether this item goes on the lorry, and how much it will
                      cost a day once it does. */}
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Chip tone="steel">
                      <Money paise={item.ratePerDay} paiseDigits />
                      /day
                    </Chip>
                    {item.qtyAvailable > 0 ? (
                      <Chip tone={item.isLow ? 'amber' : 'green'}>
                        <Qty qty={item.qtyAvailable} /> available
                      </Chip>
                    ) : (
                      <Chip tone="red">none available</Chip>
                    )}
                    {item.code && <Chip>{item.code}</Chip>}
                    {qty > 0 && (
                      <Chip tone="steel">
                        <Money paise={qty * item.ratePerDay} paiseDigits />
                        /day added
                      </Chip>
                    )}
                  </div>
                </div>

                <QtyStepper
                  label={item.name}
                  value={qty}
                  onChange={(next) => setQuantities((all) => ({ ...all, [item.id]: next }))}
                />
              </li>
            );
          })}
        </ul>
      </Card>

      <SectionTitle>Details</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
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

      {visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-2">Nothing matches “{query}”.</p>
      )}

      {/* §08.3: "running total of rent/day shown as items are added". */}
      <div className="sticky bottom-16 mt-4 rounded border border-rule bg-card p-4">
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
            <Button onClick={commit} disabled={busy || !target}>
              {busy
                ? 'Recording…'
                : target
                  ? `Lend ${chosen.reduce((sum, line) => sum + line.qty, 0)} units`
                  : 'Choose who it is going to'}
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

/**
 * Who the lending is going to, on the same page as the items.
 *
 * Everything the old two screens did, in one card that collapses once
 * answered: filter the open khatas, or create a customer inline, or open a
 * site — and "no site" lands on the customer's General khata (D61), which is
 * the fast path the owner asked for.
 *
 * The list arrives with the page, so filtering is instant and works with no
 * signal; only creating something needs the network.
 */
function TargetPicker({
  targets,
  today,
  onPick,
}: {
  targets: LendTarget[];
  today: string;
  onPick: (target: LendTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'pick' | 'customer'>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');

    if (!term) return targets.slice(0, 6);

    return targets
      .filter(
        (candidate) =>
          candidate.customerName.toLowerCase().includes(term) ||
          candidate.siteName.toLowerCase().includes(term) ||
          (digits.length >= 3 && candidate.customerMobile.includes(digits)),
      )
      .slice(0, 12);
  }, [targets, query]);

  /** A brand-new contractor: create them, then lend to their General khata. */
  async function createCustomer(name: string, mobile: string) {
    setBusy(true);
    setError(undefined);

    try {
      const created = await postJson<{ customer: { id: string; name: string; mobile: string } }>(
        '/api/customers',
        { name, mobile },
      );
      const account = await postJson<{ account: { id: string; siteName: string } }>(
        '/api/accounts/default',
        { customerId: created.customer.id },
      );

      onPick({
        accountId: account.account.id,
        customerId: created.customer.id,
        siteName: account.account.siteName,
        customerName: created.customer.name,
        customerMobile: created.customer.mobile,
        qtyOut: 0,
      });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  }

  return (
    <Card className="p-3">
      <FormError>{error}</FormError>

      {mode === 'pick' ? (
        <>
          <div className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Customer, site or mobile"
              aria-label="Find a customer or site"
              className="tap w-full rounded-xl border border-rule bg-card px-3 text-base outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
            />
            <button
              type="button"
              onClick={() => setMode('customer')}
              className="tap shrink-0 rounded-xl bg-steel px-3 font-semibold text-white hover:bg-steel-strong"
            >
              + New
            </button>
          </div>

          {matches.length > 0 ? (
            <>
              <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">
                {query.trim() ? 'Matches' : 'Recent'}
              </p>
              <ul className="divide-y divide-rule rounded-xl border border-rule">
                {matches.map((candidate) => (
                  <li key={candidate.accountId}>
                    <button
                      type="button"
                      onClick={() => onPick(candidate)}
                      className="tap flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-paper"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {candidate.customerName}
                        </span>
                        <span className="block truncate text-xs text-ink-2">
                          {candidate.siteName}
                        </span>
                      </span>
                      {candidate.qtyOut > 0 && (
                        <Chip tone="amber">
                          <Qty qty={candidate.qtyOut} /> out
                        </Chip>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-2">
              {query.trim()
                ? `Nobody matches “${query}”. Tap + New to add them.`
                : 'No open khatas yet. Tap + New to add a customer.'}
            </p>
          )}
        </>
      ) : (
        <NewCustomerInline
          busy={busy}
          onCancel={() => setMode('pick')}
          onCreate={createCustomer}
          initial={query}
        />
      )}

      <p className="mt-2 text-xs text-ink-3">
        A site is optional — a new customer starts on their general khata, and sites can be added
        from their page.
      </p>
      <span className="hidden">{today}</span>
    </Card>
  );
}

/** Name and mobile is enough (§08.3). Everything else can wait. */
function NewCustomerInline({
  busy,
  initial,
  onCancel,
  onCreate,
}: {
  busy: boolean;
  initial: string;
  onCancel: () => void;
  onCreate: (name: string, mobile: string) => void;
}) {
  const digitsOnly = /^\d+$/.test(initial.trim());
  const [name, setName] = useState(digitsOnly ? '' : initial);
  const [mobile, setMobile] = useState(digitsOnly ? initial.trim() : '');

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          id="lend-new-name"
          label="Name"
          required
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <TextInput
          id="lend-new-mobile"
          label="Mobile"
          type="tel"
          inputMode="numeric"
          required
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          disabled={busy || !name.trim() || !mobile.trim()}
          onClick={() => onCreate(name, mobile)}
        >
          {busy ? 'Adding…' : 'Add and continue'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
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
    `Bismi Rental — lent to ${target.siteName} on ${formatDayFull(committed.movedAt)}`,
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
