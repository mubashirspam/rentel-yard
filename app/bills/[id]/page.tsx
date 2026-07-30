/**
 * §09 bill view — the invoice as issued, plus PDF and WhatsApp delivery.
 *
 * Every figure here is read from the bill's frozen JSONB, never recomputed.
 */

import Link from 'next/link';

import { WhatsAppComposer } from '@/components/domain/whatsapp-composer';
import { Card, Chip, PageHeader, Screen, SectionTitle } from '@/components/ui/layout';
import { BigMoney, Money, Qty } from '@/components/ui/money';
import { requireCapability } from '@/lib/auth/guard';
import { orNotFound, requirePageSession } from '@/lib/auth/page';
import { getBill } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { formatDay, formatDayFull, formatDays } from '@/lib/format';
import { billMessage, reminderMessage, type MessageTemplate } from '@/lib/messages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  paid: 'green',
  partial: 'amber',
  pending: 'steel',
  overdue: 'red',
} as const;

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePageSession(`/bills/${id}`);
  requireCapability(session, 'money.view');

  const asOf = today();
  const bill = await orNotFound(getBill(session, id, asOf));

  const templates: MessageTemplate[] = [
    {
      id: 'bill',
      label: 'Send the invoice',
      text: billMessage({
        yardName: bill.org.name,
        invoiceNo: bill.invoiceNo,
        siteName: bill.account.siteName,
        periodFrom: bill.periodFrom,
        periodTo: bill.periodTo,
        grandTotal: bill.grandTotal,
        outstanding: bill.outstanding,
        dueOn: bill.dueOn,
      }),
    },
    {
      id: 'reminder',
      label: 'Reminder',
      text: reminderMessage({
        yardName: bill.org.name,
        customerName: bill.customer.name,
        invoiceNo: bill.invoiceNo,
        siteName: bill.account.siteName,
        outstanding: bill.outstanding,
        dueOn: bill.dueOn,
      }),
    },
  ];

  return (
    <Screen>
      <PageHeader
        back={{ href: `/accounts/${bill.account.id}`, label: bill.account.siteName }}
        title={bill.invoiceNo}
        subtitle={`${bill.customer.name} · ${formatDay(bill.periodFrom)} to ${formatDayFull(bill.periodTo)}`}
        action={<Chip tone={STATUS_TONE[bill.status]}>{bill.status}</Chip>}
      />

      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-2">
              {bill.outstanding > 0 ? 'Pending on this invoice' : 'Settled in full'}
            </p>
            <BigMoney
              paise={bill.outstanding}
              tone={bill.outstanding > 0 ? 'due' : 'settled'}
            />
          </div>
          <div className="text-right text-sm text-ink-2">
            <p>
              Total <Money paise={bill.grandTotal} />
            </p>
            <p>
              Received <Money paise={bill.allocated} />
            </p>
            {bill.dueOn && <p>Due {formatDayFull(bill.dueOn)}</p>}
          </div>
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/api/bills/${bill.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
        >
          PDF (A4)
        </a>
        <a
          href={`/api/bills/${bill.id}/pdf?format=thermal`}
          target="_blank"
          rel="noreferrer"
          className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
        >
          PDF (80mm)
        </a>
        {bill.outstanding > 0 && (
          <Link
            href={`/payments/new?account=${bill.account.id}`}
            className="tap inline-flex items-center rounded border border-rule bg-card px-4 py-2 font-medium"
          >
            Record payment
          </Link>
        )}
      </div>

      <SectionTitle>Rent</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-2">
              <th className="px-3 py-2 font-semibold">Item</th>
              <th className="px-2 py-2 text-right font-semibold">Qty</th>
              <th className="px-2 py-2 text-right font-semibold">From</th>
              <th className="px-2 py-2 text-right font-semibold">To</th>
              <th className="px-2 py-2 text-right font-semibold">Days</th>
              <th className="px-2 py-2 text-right font-semibold">Rate</th>
              <th className="px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {bill.frozen.lines.map((line, index) => (
              <tr key={`${line.lotId}-${index}`}>
                <td className="px-3 py-2">
                  {line.itemName}
                  {line.daysBilledEarlier > 0 && (
                    <span className="block text-xs text-ink-3">
                      {formatDays(line.daysBilledEarlier)} billed earlier
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right tabular">{line.qty}</td>
                <td className="px-2 py-2 text-right tabular">{formatDay(line.from)}</td>
                <td className="px-2 py-2 text-right tabular">
                  {line.to ? formatDay(line.to) : '(open)'}
                </td>
                <td className="px-2 py-2 text-right tabular">{line.days}</td>
                <td className="px-2 py-2 text-right tabular">
                  <Money paise={line.ratePerDay} paiseDigits symbol={false} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Money paise={line.amount} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {(bill.frozen.damageLines.length > 0 || bill.frozen.adjustments.length > 0) && (
        <>
          <SectionTitle>Damages and adjustments</SectionTitle>
          <Card>
            <ul className="divide-y divide-rule">
              {bill.frozen.damageLines.map((line) => (
                <li key={line.movementId} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    {line.type === 'LOST' ? 'Lost' : 'Damaged'}: {line.itemName} ×{' '}
                    <Qty qty={line.qty} /> @ <Money paise={line.unitCharge} />
                  </span>
                  <Money paise={line.amount} />
                </li>
              ))}
              {bill.frozen.adjustments.map((adjustment) => (
                <li key={adjustment.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    {adjustment.reason}{' '}
                    <span className="text-ink-3">({adjustment.kind})</span>
                  </span>
                  <Money
                    paise={adjustment.kind === 'credit' ? -adjustment.amount : adjustment.amount}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {bill.payments.length > 0 && (
        <>
          <SectionTitle>Settled by</SectionTitle>
          <Card>
            <ul className="divide-y divide-rule">
              {bill.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                  <span>
                    {formatDayFull(payment.paidOn)} · {payment.method}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                  </span>
                  <Money paise={payment.amount} />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <SectionTitle>Send it</SectionTitle>
      <WhatsAppComposer mobile={bill.customer.mobile} templates={templates} />

      <p className="mt-6 text-xs text-ink-3">
        Issued {formatDayFull(bill.issuedAt.slice(0, 10))}. A bill cannot be edited or deleted —
        corrections are a credit adjustment and a new bill (§09).
      </p>
    </Screen>
  );
}
