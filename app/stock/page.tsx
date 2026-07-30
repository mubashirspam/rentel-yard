/**
 * §08.1 /stock — item-wise owned / out / available, with alerts.
 *
 * Every figure comes from `v_item_stock`, which derives from the ledger. There
 * is no stored counter to drift (§00 rule 2).
 */

import Link from 'next/link';

import { Card, Chip, EmptyState, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { can } from '@/lib/auth/guard';
import { requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const session = await requirePageSession('/stock');
  requireCapability(session, 'movement.create');

  const stock = await listStock(session);
  const negative = stock.filter((row) => row.isNegative);
  const low = stock.filter((row) => row.isLow);

  return (
    <Screen>
      <PageHeader
        title="Stock"
        subtitle="Owned, out, and available — replayed from the ledger"
        action={
          can(session, 'item.manage') ? (
            <Link
              href="/items"
              className="tap inline-flex items-center rounded border border-rule bg-card px-3 font-medium"
            >
              Items
            </Link>
          ) : undefined
        }
      />

      {negative.length > 0 && (
        <Card className="mb-4 border-red/30 bg-red-soft p-4">
          <p className="font-medium text-red">More is out than the yard owns</p>
          <p className="mt-1 text-sm text-ink-2">
            {negative.map((row) => row.name).join(', ')}. Two gate passes may have been recorded for
            the same equipment, or the owned quantity on /items is wrong. The ledger is kept as it
            stands — the equipment really did leave (§07.4).
          </p>
        </Card>
      )}

      {low.length > 0 && (
        <Card className="mb-4 border-amber/30 bg-amber-soft p-4">
          <p className="font-medium text-amber">Running low</p>
          <p className="mt-1 text-sm text-ink-2">
            {low.map((row) => `${row.name} (${row.qtyAvailable} left)`).join(', ')}.
          </p>
        </Card>
      )}

      {stock.length === 0 ? (
        <EmptyState
          title="No items yet"
          action={
            can(session, 'item.manage') ? (
              <Link
                href="/items"
                className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
              >
                Add items
              </Link>
            ) : undefined
          }
        >
          The item master is what the yard hires out — jacks, spans, sheets, cup-lock.
        </EmptyState>
      ) : (
        <>
          <SectionTitle>Every item</SectionTitle>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-2">
                  <th className="px-4 py-2 font-semibold">Item</th>
                  <th className="px-2 py-2 text-right font-semibold">Owned</th>
                  <th className="px-2 py-2 text-right font-semibold">Out</th>
                  <th className="px-2 py-2 text-right font-semibold">Lost</th>
                  <th className="px-4 py-2 text-right font-semibold">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {stock.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{row.name}</span>
                      {!row.isActive && (
                        <>
                          {' '}
                          <Chip>Retired</Chip>
                        </>
                      )}
                      <span className="block text-xs text-ink-3">
                        <Money paise={row.ratePerDay} paiseDigits />
                        /day
                        {row.code ? ` · ${row.code}` : ''}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular">{row.qtyOwned}</td>
                    <td className="px-2 py-2 text-right tabular">{row.qtyOut}</td>
                    <td className="px-2 py-2 text-right tabular">{row.qtyLost}</td>
                    <td
                      className={`px-4 py-2 text-right tabular font-medium ${
                        row.isNegative ? 'text-red' : row.isLow ? 'text-amber' : ''
                      }`}
                    >
                      {row.qtyAvailable}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-3 text-xs text-ink-3">
            Available = owned − lost − out. Lost items reduce what the yard owns (§02).
          </p>
        </>
      )}
    </Screen>
  );
}
