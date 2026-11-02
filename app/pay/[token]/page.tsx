import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CopyButton } from '@/components/pay/copy-button';
import { billIdFromPayToken } from '@/lib/bills/pay-link';
import { billPayInfo, qrSvg } from '@/lib/bills/pay-info';
import { getBillForPayLink } from '@/lib/bills/service';
import { today } from '@/lib/clock';
import { serverEnv } from '@/lib/env';
import { formatDay, formatDayFull } from '@/lib/format';
import { formatPaise } from '@/lib/money';
import { loadPaymentDetails } from '@/lib/settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * D70 — the public "pay this bill" page a WhatsApp bill links to.
 *
 * WhatsApp only makes https links tappable, so the message carries this page
 * and this page carries the `upi://` button, a QR of the same link, and the
 * bank details. Read-only; nothing is collected here. The balance is the
 * server's own figure for this bill, so a link opened next week is still right.
 */

type Props = { params: Promise<{ token: string }> };

async function load(token: string) {
  const billId = billIdFromPayToken(token, serverEnv().PORTAL_TOKEN_PEPPER);
  if (!billId) return null;
  try {
    const bill = await getBillForPayLink(billId, today());
    const details = await loadPaymentDetails(bill.orgId);
    return { bill, info: billPayInfo(bill, details) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).token);
  if (!data) return { title: 'Bill not found', robots: { index: false } };
  const { bill, info } = data;
  const title =
    info.amount > 0
      ? `Pay ${formatPaise(info.amount)} · ${bill.org.name}`
      : `${bill.invoiceNo} is paid · ${bill.org.name}`;
  return {
    title,
    description: `Invoice ${bill.invoiceNo} · ${bill.account.siteName} · ${bill.customer.name}`,
    robots: { index: false, follow: false },
    openGraph: { title, description: `Invoice ${bill.invoiceNo} · ${bill.account.siteName}` },
  };
}

export default async function PayPage({ params }: Props) {
  const data = await load((await params).token);
  if (!data) notFound();
  const { bill, info } = data;
  const d = info.details;
  const qr = info.upiUri ? await qrSvg(info.upiUri) : null;
  const paid = info.amount <= 0;

  const bank: Array<[string, string]> = [
    ['Account name', d.bankAccountName],
    ['Account number', d.bankAccountNumber],
    ['IFSC', d.bankIfsc],
    ['Bank', d.bankName],
  ].filter((row): row is [string, string] => Boolean(row[1]));

  return (
    <main className="mx-auto w-full max-w-[460px] flex-1 bg-[#f7f8fa] px-5 pb-10 pt-7 text-[#232936]">
      <p className="text-[10px] font-bold uppercase tracking-[1.6px] text-[#737b89]">
        {bill.org.name}
      </p>
      <h1 className="mt-1 text-[23px] font-bold tracking-[-0.8px]">Invoice {bill.invoiceNo}</h1>
      <p className="text-xs text-[#737b89]">
        {bill.customer.name} · {bill.account.siteName} · {formatDay(bill.periodFrom)} –{' '}
        {formatDayFull(bill.periodTo)}
      </p>

      {/* Amount and the one big action */}
      <section className="mt-5 rounded-[22px] bg-[#edf0fc] p-5">
        <p className="text-xs text-[#737b89]">{paid ? 'This bill' : 'Amount due'}</p>
        <p className="text-[34px] font-bold tracking-[-1.2px]">
          {paid ? 'Paid in full' : formatPaise(info.amount)}
        </p>
        {paid ? (
          <p className="mt-1 text-sm text-[#32765a]">Thank you — nothing is owed on this bill.</p>
        ) : info.upiUri ? (
          <>
            <a
              href={info.upiUri}
              className="mt-4 flex min-h-12 w-full items-center justify-center rounded-[14px] bg-[#5265d6] text-[15px] font-semibold text-white"
            >
              Pay {formatPaise(info.amount)} with UPI
            </a>
            <p className="mt-2 text-center text-[11px] text-[#737b89]">
              Opens Google Pay, PhonePe, Paytm or BHIM with the amount filled in.
            </p>
          </>
        ) : null}
      </section>

      {!paid && qr && (
        <section className="mt-4 rounded-[22px] border border-[#e9ecf1] bg-white p-5 text-center">
          <div
            className="mx-auto w-52 [&_svg]:h-auto [&_svg]:w-full"
            aria-label={`UPI QR code for ${formatPaise(info.amount)}`}
            role="img"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <p className="mt-2 text-xs text-[#737b89]">
            Paying from another phone? Scan with any UPI app.
          </p>
        </section>
      )}

      {!paid && (d.upiId || bank.length > 0) && (
        <section className="mt-4 rounded-[22px] border border-[#e9ecf1] bg-white px-5 py-2">
          {d.upiId && (
            <Row label="UPI ID" value={d.upiId} />
          )}
          {bank.map(([label, value]) => (
            <Row key={label} label={label} value={value} copy={label !== 'Bank'} />
          ))}
        </section>
      )}

      {!paid && !info.hasDetails && (
        <p className="mt-4 rounded-[17px] bg-[#fff0e4] px-4 py-3 text-xs text-[#815b39]">
          Please pay {bill.org.name} directly{bill.org.phone ? ` — ${bill.org.phone}` : ''}.
        </p>
      )}

      {/* What the bill is for */}
      <section className="mt-4 rounded-[22px] border border-[#e9ecf1] bg-white px-5 py-2">
        {bill.frozen.lines.map((line, i) => (
          <div
            key={i}
            className="flex justify-between gap-4 border-b border-[#e9ecf1] py-3 text-xs last:border-0"
          >
            <span className="text-[#737b89]">
              <b className="font-semibold text-[#232936]">{line.itemName}</b> × {line.qty} ·{' '}
              {line.days} {line.days === 1 ? 'day' : 'days'}
            </span>
            <b>{formatPaise(line.amount)}</b>
          </div>
        ))}
        {bill.frozen.damageLines.map((line) => (
          <div
            key={line.movementId}
            className="flex justify-between gap-4 border-b border-[#e9ecf1] py-3 text-xs last:border-0"
          >
            <span className="text-[#737b89]">
              {line.type === 'LOST' ? 'Lost' : 'Damaged'}: {line.itemName} × {line.qty}
            </span>
            <b>{formatPaise(line.amount)}</b>
          </div>
        ))}
        <div className="flex justify-between py-3 text-sm font-semibold">
          <span>Total</span>
          <span>{formatPaise(bill.grandTotal)}</span>
        </div>
        {bill.allocated > 0 && (
          <div className="flex justify-between pb-3 text-xs text-[#32765a]">
            <span>Already paid</span>
            <span>− {formatPaise(bill.allocated)}</span>
          </div>
        )}
      </section>

      <p className="mt-5 text-center text-[11px] leading-relaxed text-[#737b89]">
        After paying, please send the payment screenshot to {bill.org.name}
        {bill.org.phone ? ` on ${bill.org.phone}` : ''}.
        <br />
        Payments go straight to {bill.org.name}&apos;s account.
      </p>
    </main>
  );
}

function Row({ label, value, copy = true }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#e9ecf1] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[#737b89]">{label}</p>
        <p className="select-all break-all text-sm font-semibold">{value}</p>
      </div>
      {copy && <CopyButton value={value} label={label} />}
    </div>
  );
}
