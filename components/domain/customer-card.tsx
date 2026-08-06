import Link from 'next/link';

import type { CustomerCardFacts } from '@/lib/customers/cards';

import { Card, Chip } from '../ui/layout';
import { Money, Qty } from '../ui/money';

/**
 * A contractor, as one tappable card.
 *
 * The redesign's unit of work. Home and Customers were two different lists of
 * two different things — the dashboard listed *sites* grouped under a name,
 * Accounts listed *khatas* grouped under a name — and neither answered the
 * question a yard actually asks, which is about the person: what has Ibrahim
 * got, what does he owe, and is there anything of his I have to do today.
 *
 * So the card carries exactly that and nothing else. Name and a line of scale
 * on the left, the total due on the right where money belongs, and beneath
 * them the chips that say whether there is work: *N sites out* if he is holding
 * equipment, *₹X to bill* if finished hire is sitting uninvoiced, *settled* if
 * neither. The sites themselves are one tap away, on his own screen — putting
 * them here is what made the dashboard four screens long.
 *
 * The due figure is green at zero and red above it, per §08.5's rule that
 * colour carries state and only state.
 */
export function CustomerCard({ facts }: { facts: CustomerCardFacts }) {
  const { customerName, balance, qtyOut, sitesOut, siteCount, unbilled } = facts;
  const settled = sitesOut === 0 && unbilled === 0 && balance === 0;

  return (
    <Link href={`/customers/${facts.customerId}`} className="tap block">
      <Card className="p-3.5 transition-colors hover:bg-paper active:bg-paper">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate font-semibold">{customerName}</span>
            <span className="block truncate text-xs text-ink-2">
              {siteCount} {siteCount === 1 ? 'site' : 'sites'}
              {qtyOut > 0 && (
                <>
                  {' · '}
                  <Qty qty={qtyOut} /> out
                </>
              )}
            </span>
          </span>
          <Money
            paise={balance}
            className={`shrink-0 text-base font-bold ${balance > 0 ? 'text-red' : 'text-green'}`}
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {sitesOut > 0 && (
            <Chip tone="amber">
              {sitesOut} {sitesOut === 1 ? 'site' : 'sites'} out
            </Chip>
          )}
          {unbilled > 0 && (
            <Chip tone="red">
              <Money paise={unbilled} /> to bill
            </Chip>
          )}
          {settled && <Chip tone="green">settled</Chip>}
          {!settled && sitesOut === 0 && unbilled === 0 && balance !== 0 && (
            <Chip tone="steel">billed, unpaid</Chip>
          )}
        </div>
      </Card>
    </Link>
  );
}
