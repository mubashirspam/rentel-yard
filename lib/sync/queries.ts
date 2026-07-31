'use client';

/**
 * Reading the yard from the device's own copy (§07.1 read mirror).
 *
 * These return the **same shapes** the server returns — `StockRow`,
 * `OutstandingLine` — so a screen can be handed either without knowing which it
 * got. That is the whole trick: there is one set of components, not an online
 * set and an offline set that drift apart.
 *
 * Availability and outstanding are *computed here*, by the same pure engine the
 * server uses (`lib/accrual`). It imports nothing that touches a network or a
 * clock, so it runs identically on a phone with no signal. Without that, an
 * offline return sheet would be guessing.
 */

import { accrue, type BillingConfig, type Movement } from '../accrual';
import { DEFAULT_BILLING_CONFIG } from '../accrual';
import type { OutstandingLine } from '../accounts/service';
import type { StockRow } from '../stock/service';
import { availabilityByItem, isLowStock, qtyAvailable } from './availability';
import { hasIndexedDb, yardDb } from './db';

interface MirrorItem {
  id: string;
  name: string;
  code: string | null;
  unit: string;
  qtyOwned: number;
  ratePerDay: number;
  replacementRate: number;
  isActive: boolean;
  sortOrder?: number;
}

interface MirrorMovement {
  id: string;
  accountId: string;
  itemId: string;
  type: Movement['type'];
  qty: number;
  movedAt: string;
  rateSnapshot: number;
  replacementSnapshot: number;
  manualCharge?: number | null;
  reversesId?: string | null;
  createdAt: string;
}

export interface MirrorAccount {
  id: string;
  customerId: string;
  siteName: string;
  status: 'open' | 'closed';
  openedOn: string;
  customerName: string;
  customerMobile: string;
}

/**
 * Every item with its availability, recomputed from the mirrored ledger.
 *
 * `v_item_stock` cannot come along — it is a database view — so the same
 * arithmetic is done here: owned − lost − out, per §02.
 */
export async function mirrorStock(): Promise<StockRow[]> {
  if (!hasIndexedDb()) return [];

  const db = yardDb();
  const [items, movements] = await Promise.all([
    db.items.toArray() as Promise<unknown[]>,
    db.movements.toArray() as Promise<unknown[]>,
  ]);

  // Shared with `availability.test.ts`, which pins this arithmetic to
  // `v_item_stock` on a real Postgres. Do not inline it back in here.
  const totals = availabilityByItem(movements as MirrorMovement[]);

  return (items as MirrorItem[])
    .map((item) => {
      const itemTotals = totals.get(item.id) ?? { qtyOut: 0, qtyLost: 0 };
      const available = qtyAvailable(item.qtyOwned, itemTotals);

      return {
        id: item.id,
        name: item.name,
        code: item.code,
        unit: item.unit,
        qtyOwned: item.qtyOwned,
        qtyOut: itemTotals.qtyOut,
        qtyLost: itemTotals.qtyLost,
        qtyAvailable: available,
        ratePerDay: item.ratePerDay,
        replacementRate: item.replacementRate,
        isActive: item.isActive,
        isNegative: available < 0,
        isLow: isLowStock(item.qtyOwned, available),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Open sites, with the contractor's name attached for the picker. */
export async function mirrorAccounts(customerId?: string): Promise<MirrorAccount[]> {
  if (!hasIndexedDb()) return [];

  const db = yardDb();
  const [accounts, customers] = await Promise.all([
    db.accounts.toArray() as Promise<unknown[]>,
    db.customers.toArray() as Promise<unknown[]>,
  ]);

  const byId = new Map(
    (customers as Array<{ id: string; name: string; mobile: string }>).map((row) => [row.id, row]),
  );

  return (accounts as Array<Omit<MirrorAccount, 'customerName' | 'customerMobile'>>)
    .filter((account) => account.status === 'open')
    .filter((account) => !customerId || account.customerId === customerId)
    .map((account) => ({
      ...account,
      customerName: byId.get(account.customerId)?.name ?? 'Unknown customer',
      customerMobile: byId.get(account.customerId)?.mobile ?? '',
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
}

export async function mirrorCustomers(query: string): Promise<
  Array<{ id: string; name: string; mobile: string; isBlocked: boolean }>
> {
  if (!hasIndexedDb()) return [];

  const term = query.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');

  const rows = (await yardDb().customers.toArray()) as unknown as Array<{
    id: string;
    name: string;
    mobile: string;
    isBlocked: boolean;
  }>;

  return rows
    .filter((row) => {
      if (term === '') return true;
      if (row.name.toLowerCase().includes(term)) return true;
      return digits.length >= 3 && row.mobile.includes(digits);
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);
}

/**
 * What one site still holds, valued on the device.
 *
 * Same replay as the account screen, so the quantities an admin sees with no
 * signal are the quantities the server will check the return against.
 */
export async function mirrorOutstanding(
  accountId: string,
  asOf: string,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): Promise<OutstandingLine[]> {
  if (!hasIndexedDb()) return [];

  const db = yardDb();
  const [rawMovements, rawItems] = await Promise.all([
    db.movements.where('accountId').equals(accountId).toArray() as Promise<unknown[]>,
    db.items.toArray() as Promise<unknown[]>,
  ]);

  const items = new Map((rawItems as MirrorItem[]).map((item) => [item.id, item]));

  const movements: Movement[] = (rawMovements as MirrorMovement[])
    .map((row) => ({
      id: row.id,
      itemId: row.itemId,
      type: row.type,
      qty: row.qty,
      movedAt: row.movedAt,
      rateSnapshot: row.rateSnapshot,
      replacementSnapshot: row.replacementSnapshot,
      manualCharge: row.manualCharge ?? undefined,
      reversesId: row.reversesId,
      createdAt: row.createdAt,
    }))
    .sort((a, b) => a.movedAt.localeCompare(b.movedAt) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

  let accrual;
  try {
    accrual = accrue(movements, config, asOf);
  } catch {
    // A mirror mid-sync can hold a return whose issue has not arrived. Better a
    // quiet empty list than a screen that will not open in a yard.
    return [];
  }

  const byItem = new Map<string, OutstandingLine>();

  for (const lot of accrual.openLots) {
    const item = items.get(lot.itemId);
    const existing = byItem.get(lot.itemId);

    if (existing) {
      existing.qtyOut += lot.qty;
      existing.accruingPerDay += lot.qty * lot.ratePerDay;
      existing.accruedSoFar += lot.accruedAmount;
      if (lot.from < existing.since) {
        existing.since = lot.from;
        existing.daysHeld = lot.daysHeld;
      }
      continue;
    }

    byItem.set(lot.itemId, {
      itemId: lot.itemId,
      itemName: item?.name ?? 'Unknown item',
      itemCode: item?.code ?? null,
      unit: item?.unit ?? 'nos',
      qtyOut: lot.qty,
      since: lot.from,
      daysHeld: lot.daysHeld,
      accruingPerDay: lot.qty * lot.ratePerDay,
      accruedSoFar: lot.accruedAmount,
    });
  }

  return [...byItem.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

/** True when the device has a usable copy to work from. */
export async function mirrorHasData(): Promise<boolean> {
  if (!hasIndexedDb()) return false;
  return (await yardDb().items.count()) > 0;
}
