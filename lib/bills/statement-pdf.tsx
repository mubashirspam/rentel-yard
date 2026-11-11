/**
 * The customer statement PDF (A4): a summary of every bill, then each bill in
 * full, then the payments taken, then where to pay. See `statement.ts`.
 */

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { BillPaymentStatus } from '../accrual';
import { formatDay, formatDayFull } from '../format';
import { formatPaise } from '../money';
import type { BillPayInfo } from './pay-info';
import { PayBlock } from './pdf';
import { PDF_FONT, pinFontTags, registerPdfFonts } from './pdf-fonts';
import type { CustomerStatement } from './statement';

const INK = '#15181c';
const MUTED = '#4a545e';
const RULE = '#d5d9de';

const s = StyleSheet.create({
  page: { paddingVertical: 28, paddingHorizontal: 30, fontSize: 8.5, fontFamily: PDF_FONT },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  yardName: { fontSize: 13, fontWeight: 700 },
  title: { fontSize: 13, fontWeight: 700, textAlign: 'right' },
  muted: { color: MUTED },
  right: { textAlign: 'right' },
  bold: { fontWeight: 700 },

  summary: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: RULE,
    borderRadius: 6,
    marginVertical: 10,
  },
  summaryCell: { flex: 1, padding: 8 },
  summaryLabel: { color: MUTED, fontSize: 8 },
  summaryValue: { fontSize: 13, fontWeight: 700 },

  section: { fontSize: 10.5, fontWeight: 700, marginTop: 14, marginBottom: 4 },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 2,
    marginBottom: 2,
    fontWeight: 700,
  },
  row: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.5, borderBottomColor: RULE },
  totalRow: { flexDirection: 'row', paddingTop: 3, borderTopWidth: 1, borderTopColor: INK, fontWeight: 700 },

  bill: { marginTop: 10, borderWidth: 1, borderColor: RULE, borderRadius: 6, padding: 8 },
  billHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  line: { flexDirection: 'row', paddingVertical: 1 },
  billTotals: { marginTop: 4, alignSelf: 'flex-end', width: 200 },
  billTotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
});

const STATUS_TEXT: Record<BillPaymentStatus, string> = {
  paid: 'Paid',
  partial: 'Part paid',
  pending: 'Not paid',
  overdue: 'Overdue',
};

/** Status as a word, so it reads the same printed in black and white. */
function statusText(status: BillPaymentStatus): string {
  return STATUS_TEXT[status].toUpperCase();
}

function period(from: string, to: string): string {
  return `${formatDay(from)} – ${formatDayFull(to)}`;
}

export function StatementDocument({
  statement,
  pay,
}: {
  statement: CustomerStatement;
  pay?: { info: BillPayInfo; qr: string | null };
}) {
  const { customer, org, bills, payments, totals } = statement;

  return (
    <Document
      title={`Statement — ${customer.name} — ${statement.asOf}`}
      author={org.name}
      creator={org.name}
      producer="Yard Ledger"
    >
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.yardName}>{org.name}</Text>
            {org.address && <Text style={s.muted}>{org.address}</Text>}
            {org.phone && <Text style={s.muted}>{org.phone}</Text>}
          </View>
          <View>
            <Text style={s.title}>Statement of account</Text>
            <Text style={[s.muted, s.right]}>As of {formatDayFull(statement.asOf)}</Text>
            <Text style={[s.muted, s.right]}>
              {statement.scope === 'unpaid' ? 'Unpaid bills only' : 'All bills'}
            </Text>
          </View>
        </View>

        <Text style={s.bold}>{customer.name}</Text>
        <Text style={s.muted}>{customer.mobile}</Text>

        <View style={s.summary}>
          <View style={s.summaryCell}>
            <Text style={s.summaryLabel}>Total billed ({bills.length} {bills.length === 1 ? 'bill' : 'bills'})</Text>
            <Text style={s.summaryValue}>{formatPaise(totals.billed)}</Text>
          </View>
          <View style={[s.summaryCell, { borderLeftWidth: 1, borderLeftColor: RULE }]}>
            <Text style={s.summaryLabel}>Paid</Text>
            <Text style={s.summaryValue}>{formatPaise(totals.settled)}</Text>
          </View>
          <View style={[s.summaryCell, { borderLeftWidth: 1, borderLeftColor: RULE }]}>
            <Text style={s.summaryLabel}>Balance due</Text>
            <Text style={s.summaryValue}>{formatPaise(totals.outstanding)}</Text>
          </View>
        </View>

        <Text style={s.section}>Bills</Text>
        {bills.length === 0 ? (
          <Text style={s.muted}>No bills.</Text>
        ) : (
          <View>
            <View style={s.headRow}>
              <Text style={{ width: 16 }}>#</Text>
              <Text style={{ flex: 1.5 }}>Invoice</Text>
              <Text style={{ flex: 1.6 }}>Site</Text>
              <Text style={{ flex: 1.9 }}>Period</Text>
              <Text style={{ flex: 1.1 }}>Due on</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>Total</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>Paid</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>Balance</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>Status</Text>
            </View>
            {bills.map((bill, index) => (
              <View key={bill.id} style={s.row} wrap={false}>
                <Text style={{ width: 16 }}>{index + 1}</Text>
                <Text style={{ flex: 1.5 }}>{bill.invoiceNo}</Text>
                <Text style={{ flex: 1.6 }}>{bill.account.siteName}</Text>
                <Text style={{ flex: 1.9 }}>{period(bill.periodFrom, bill.periodTo)}</Text>
                <Text style={{ flex: 1.1 }}>{bill.dueOn ? formatDayFull(bill.dueOn) : '—'}</Text>
                <Text style={[{ flex: 1.1 }, s.right]}>{formatPaise(bill.grandTotal)}</Text>
                <Text style={[{ flex: 1.1 }, s.right]}>{formatPaise(bill.allocated)}</Text>
                <Text style={[{ flex: 1.1 }, s.right, s.bold]}>
                  {formatPaise(Math.max(0, bill.outstanding))}
                </Text>
                <Text style={[{ flex: 1.1 }, s.right]}>{statusText(bill.status)}</Text>
              </View>
            ))}
            <View style={s.totalRow} wrap={false}>
              <Text style={{ flex: 7.1 }}>Total</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>{formatPaise(totals.billed)}</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>{formatPaise(totals.settled)}</Text>
              <Text style={[{ flex: 1.1 }, s.right]}>{formatPaise(totals.outstanding)}</Text>
              <Text style={{ flex: 1.1 }} />
            </View>
          </View>
        )}

        {pay && pay.info.amount > 0 && pay.info.hasDetails && (
          <PayBlock info={pay.info} qr={pay.qr} thermal={false} />
        )}

        {bills.length > 0 && <Text style={s.section}>Bill details</Text>}
        {bills.map((bill, index) => (
          <BillSection key={bill.id} bill={bill} number={index + 1} />
        ))}

        {payments.length > 0 && (
          <>
            <Text style={s.section}>Payments received</Text>
            <View style={s.headRow}>
              <Text style={{ flex: 1.2 }}>Date</Text>
              <Text style={{ flex: 2 }}>Site</Text>
              <Text style={{ flex: 1 }}>Method</Text>
              <Text style={{ flex: 1.6 }}>Reference</Text>
              <Text style={[{ flex: 1.2 }, s.right]}>Discount</Text>
              <Text style={[{ flex: 1.2 }, s.right]}>Amount</Text>
            </View>
            {payments.map((p) => (
              <View key={p.id} style={s.row} wrap={false}>
                <Text style={{ flex: 1.2 }}>{formatDayFull(p.paidOn)}</Text>
                <Text style={{ flex: 2 }}>{p.siteName}</Text>
                <Text style={{ flex: 1 }}>{p.method.toUpperCase()}</Text>
                <Text style={{ flex: 1.6 }}>{p.reference ?? ''}</Text>
                <Text style={[{ flex: 1.2 }, s.right]}>{p.discount > 0 ? formatPaise(p.discount) : ''}</Text>
                <Text style={[{ flex: 1.2 }, s.right]}>{formatPaise(p.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {org.termsText && <Text style={{ marginTop: 16, fontSize: 7, color: MUTED }}>{org.termsText}</Text>}

        <Text
          style={{ position: 'absolute', bottom: 14, right: 30, fontSize: 7, color: MUTED }}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

function BillSection({ bill, number }: { bill: CustomerStatement['bills'][number]; number: number }) {
  const { lines, damageLines, adjustments } = bill.frozen;

  return (
    <View style={s.bill} wrap={lines.length > 12}>
      <View style={s.billHead}>
        <View>
          <Text style={s.bold}>
            {number}. {bill.invoiceNo} · {bill.account.siteName}
          </Text>
          <Text style={s.muted}>
            {period(bill.periodFrom, bill.periodTo)} · issued {formatDayFull(bill.issuedAt.slice(0, 10))}
            {bill.dueOn ? ` · due ${formatDayFull(bill.dueOn)}` : ''}
          </Text>
        </View>
        <Text style={s.bold}>{statusText(bill.status)}</Text>
      </View>

      {lines.length > 0 && (
        <View style={s.headRow}>
          <Text style={{ flex: 3 }}>Item</Text>
          <Text style={[{ flex: 0.8 }, s.right]}>Qty</Text>
          <Text style={[{ flex: 1.2 }, s.right]}>From</Text>
          <Text style={[{ flex: 1.2 }, s.right]}>To</Text>
          <Text style={[{ flex: 0.8 }, s.right]}>Days</Text>
          <Text style={[{ flex: 1.1 }, s.right]}>Rate/day</Text>
          <Text style={[{ flex: 1.3 }, s.right]}>Amount</Text>
        </View>
      )}
      {lines.map((line, index) => (
        <View key={`${line.lotId}-${index}`} style={s.line}>
          <Text style={{ flex: 3 }}>{line.itemName}</Text>
          <Text style={[{ flex: 0.8 }, s.right]}>{line.qty}</Text>
          <Text style={[{ flex: 1.2 }, s.right]}>{formatDay(line.from)}</Text>
          <Text style={[{ flex: 1.2 }, s.right]}>{line.to ? formatDay(line.to) : '(open)'}</Text>
          <Text style={[{ flex: 0.8 }, s.right]}>{line.days}</Text>
          <Text style={[{ flex: 1.1 }, s.right]}>
            {formatPaise(line.ratePerDay, { paiseDigits: true })}
          </Text>
          <Text style={[{ flex: 1.3 }, s.right]}>{formatPaise(line.amount)}</Text>
        </View>
      ))}
      {damageLines.map((line) => (
        <View key={line.movementId} style={s.line}>
          <Text style={{ flex: 8.1 }}>
            {line.type === 'LOST' ? 'Lost' : 'Damaged'}: {line.itemName} × {line.qty} @{' '}
            {formatPaise(line.unitCharge)}
          </Text>
          <Text style={[{ flex: 1.3 }, s.right]}>{formatPaise(line.amount)}</Text>
        </View>
      ))}
      {adjustments.map((adjustment) => (
        <View key={adjustment.id} style={s.line}>
          <Text style={{ flex: 8.1 }}>
            {adjustment.reason} ({adjustment.kind})
          </Text>
          <Text style={[{ flex: 1.3 }, s.right]}>
            {adjustment.kind === 'credit' ? '−' : ''}
            {formatPaise(adjustment.amount)}
          </Text>
        </View>
      ))}

      <View style={s.billTotals}>
        <View style={[s.billTotalRow, s.bold]}>
          <Text>Bill total</Text>
          <Text>{formatPaise(bill.grandTotal)}</Text>
        </View>
        {bill.payments.map((p) => (
          <View key={p.id} style={s.billTotalRow}>
            <Text style={s.muted}>
              Paid {formatDayFull(p.paidOn)} ({p.method})
            </Text>
            <Text>−{formatPaise(p.amount)}</Text>
          </View>
        ))}
        <View style={[s.billTotalRow, s.bold, { borderTopWidth: 1, borderTopColor: INK, marginTop: 2 }]}>
          <Text>Balance</Text>
          <Text>{formatPaise(Math.max(0, bill.outstanding))}</Text>
        </View>
      </View>
    </View>
  );
}

export async function renderStatementPdf(
  statement: CustomerStatement,
  pay?: { info: BillPayInfo; qr: string | null },
): Promise<Buffer> {
  registerPdfFonts();
  return pinFontTags(await renderToBuffer(<StatementDocument statement={statement} pay={pay} />));
}
