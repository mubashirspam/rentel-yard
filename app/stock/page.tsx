/**
 * §08.1 /stock — item-wise owned / out / available, with alerts.
 *
 * A tab of its own since the redesign, because "have we got twenty spans?" is
 * asked at the gate, mid-conversation, and it was two taps down under More.
 *
 * A table, on the owner's instruction, and this is the right screen for one:
 * every row holds the same four numbers, and four numbers per row down a page
 * is precisely what a table is for — the eye runs down the *Free* column and
 * finds the short one without reading a single item name.
 *
 * What it is not is the table this screen used to have. That one carried its
 * rate and code in the name cell and wrapped every figure in a chip, and at
 * 360px it scrolled sideways — so *available*, the number an admin opened the
 * screen for, was the one off the right edge. This one is built to the width
 * of the phone:
 *
 *   - Four numeric columns at a fixed 2.75rem, so they line up down the page
 *     and the name takes whatever is left and wraps.
 *   - Bare tabular figures, not chips. A chip is padding around a number; four
 *     of them per row is what pushed the table off the screen. State is
 *     carried by colour on the figure itself, which is the same amber/red/green
 *     it means everywhere else, and by weight on the column that matters.
 *   - Zeros go grey rather than shouting. A yard has a lot of zeros in the
 *     *Lost* column and every one of them is good news.
 *
 * `overflow-x-auto` stays as a floor, not a plan: an item named beyond all
 * reason should scroll its own table rather than push the page sideways.
 *
 * Every figure comes from `v_item_stock`, which derives from the ledger. There
 * is no stored counter to drift (§00 rule 2).
 */

import Link from 'next/link';

import { Alert, Card, Chip, EmptyState, PageHeader, Screen } from '@/components/ui/layout';
import { Money } from '@/components/ui/money';
import { can, requireCapability } from '@/lib/auth/guard';
import { requirePageSession } from '@/lib/auth/page';
import { listStock } from '@/lib/stock/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every numeric column, so the header and the body cannot drift apart. */
const NUM = 'w-11 px-1 py-2 text-right tabular';

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
        subtitle={`${stock.length} ${stock.length === 1 ? 'item' : 'items'} · owned, out, available`}
        action={
          can(session, 'item.manage') ? (
            <Link
              href="/items"
              className="tap inline-flex items-center rounded-xl border border-rule bg-card px-3 font-medium"
            >
              Items
            </Link>
          ) : undefined
        }
      />

      {negative.length > 0 && (
        <Alert
          title="More is out than the yard owns"
          detail={`${negative.map((row) => row.name).join(', ')} — two gate passes may cover the same equipment, or the owned quantity is wrong. The ledger stands: it really did leave (§07.4).`}
        />
      )}

      {low.length > 0 && (
        <div className={negative.length > 0 ? 'mt-2' : ''}>
          <Alert
            tone="amber"
            title={
              low.length === 1 ? `${low[0].name} is running low` : `${low.length} items running low`
            }
            detail={low.map((row) => `${row.name} (${row.qtyAvailable} left)`).join(', ')}
          />
        </div>
      )}

      {stock.length === 0 ? (
        <EmptyState
          title="No items yet"
          action={
            can(session, 'item.manage') ? (
              <Link
                href="/items"
                className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
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
          <Card className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-xs uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 text-left font-semibold">Item</th>
                  <th className={`${NUM} font-semibold`}>Owned</th>
                  <th className={`${NUM} font-semibold`}>Out</th>
                  <th className={`${NUM} font-semibold`}>Lost</th>
                  <th className={`${NUM} pr-3 font-semibold`}>Free</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-rule">
                {stock.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      {/* Wraps rather than truncates. An item name is what the
                          admin matches against the stack on the racks, and
                          "Jack (adjustable prop)…" is not something you can
                          count against. */}
                      <span className="font-medium leading-snug">{row.name}</span>
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

                    <td className={`${NUM} text-ink-2`}>{row.qtyOwned}</td>
                    <td className={`${NUM} ${row.qtyOut > 0 ? 'text-amber' : 'text-ink-3'}`}>
                      {row.qtyOut}
                    </td>
                    <td className={`${NUM} ${row.qtyLost > 0 ? 'text-red' : 'text-ink-3'}`}>
                      {row.qtyLost}
                    </td>

                    {/* The number the screen exists for: bold, last, and
                        coloured by whether it can actually be lent today. */}
                    <td
                      className={`${NUM} pr-3 font-bold ${
                        row.isNegative || row.qtyAvailable === 0
                          ? 'text-red'
                          : row.isLow
                            ? 'text-amber'
                            : 'text-green'
                      }`}
                    >
                      {row.qtyAvailable}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-green" /> free to lend
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber" /> out / running low
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red" /> none left / lost
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-3">
            Free = owned − lost − out. Lost items reduce what the yard owns (§02).
          </p>
        </>
      )}
    </Screen>
  );
}
