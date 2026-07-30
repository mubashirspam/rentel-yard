/**
 * Bill PDFs (§09) — A4 for the file, 80mm for the thermal printer at the gate.
 *
 * Deterministic by construction: every figure comes from the bill's frozen
 * JSONB, and `creationDate` is pinned to the bill's own `issuedAt` rather than
 * left to default to now. Re-render the same bill id next year and the bytes
 * match, which is what makes a PDF worth arguing from.
 *
 * No headless browser — §09 rules it out as too heavy for the free tier.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import { formatDay, formatDayFull } from '../format';
import { formatPaise } from '../money';
import type { BillDetail } from './service';

export type BillFormat = 'a4' | 'thermal';

/** 80mm at 72dpi ≈ 226pt. Height grows with the content. */
const THERMAL_WIDTH = 226;

const styles = StyleSheet.create({
  page: { paddingVertical: 28, paddingHorizontal: 32, fontSize: 9, fontFamily: 'Helvetica' },
  thermalPage: { paddingVertical: 12, paddingHorizontal: 10, fontSize: 7, fontFamily: 'Helvetica' },

  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  yardName: { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#4a545e' },
  invoiceNo: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  block: { marginBottom: 10 },
  row: { flexDirection: 'row' },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#15181c',
    paddingBottom: 3,
    marginBottom: 3,
    fontFamily: 'Helvetica-Bold',
  },
  lineRow: { flexDirection: 'row', paddingVertical: 2 },

  item: { flex: 3 },
  qty: { flex: 1, textAlign: 'right' },
  date: { flex: 1.4, textAlign: 'right' },
  days: { flex: 1, textAlign: 'right' },
  rate: { flex: 1.2, textAlign: 'right' },
  amount: { flex: 1.6, textAlign: 'right' },

  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 2 },
  totalLabel: { width: 120, textAlign: 'right', paddingRight: 10 },
  totalValue: { width: 80, textAlign: 'right' },
  grand: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  rule: { borderTopWidth: 1, borderTopColor: '#15181c', marginTop: 4, paddingTop: 4 },
  terms: { marginTop: 18, fontSize: 7, color: '#4a545e' },
});

export function BillDocument({ bill, format }: { bill: BillDetail; format: BillFormat }) {
  const thermal = format === 'thermal';

  return (
    <Document
      title={`${bill.invoiceNo} — ${bill.customer.name}`}
      author={bill.org.name}
      creator={bill.org.name}
      producer="Yard Ledger"
      // Pinned, so the same bill renders byte-identically every time.
      creationDate={new Date(bill.issuedAt)}
      modificationDate={new Date(bill.issuedAt)}
    >
      <Page
        size={thermal ? { width: THERMAL_WIDTH } : 'A4'}
        style={thermal ? styles.thermalPage : styles.page}
      >
        <Header bill={bill} thermal={thermal} />
        <RentTable bill={bill} thermal={thermal} />
        <Totals bill={bill} />
        {bill.org.termsText && !thermal && <Text style={styles.terms}>{bill.org.termsText}</Text>}
      </Page>
    </Document>
  );
}

function Header({ bill, thermal }: { bill: BillDetail; thermal: boolean }) {
  const period = `${formatDay(bill.periodFrom)} → ${formatDayFull(bill.periodTo)}`;

  if (thermal) {
    return (
      <View style={styles.block}>
        <Text style={styles.yardName}>{bill.org.name}</Text>
        {bill.org.phone && <Text style={styles.muted}>{bill.org.phone}</Text>}
        <Text style={{ marginTop: 4, fontFamily: 'Helvetica-Bold' }}>{bill.invoiceNo}</Text>
        <Text style={styles.muted}>{period}</Text>
        <Text style={{ marginTop: 4 }}>{bill.customer.name}</Text>
        <Text style={styles.muted}>
          {bill.customer.mobile} · {bill.account.siteName}
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.yardName}>{bill.org.name}</Text>
          {bill.org.address && <Text style={styles.muted}>{bill.org.address}</Text>}
          {bill.org.phone && <Text style={styles.muted}>{bill.org.phone}</Text>}
        </View>
        <View>
          <Text style={styles.invoiceNo}>{bill.invoiceNo}</Text>
          <Text style={[styles.muted, { textAlign: 'right' }]}>Period: {period}</Text>
          {bill.dueOn && (
            <Text style={[styles.muted, { textAlign: 'right' }]}>
              Due {formatDayFull(bill.dueOn)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{bill.customer.name}</Text>
        <Text style={styles.muted}>{bill.customer.mobile}</Text>
        <Text style={styles.muted}>{bill.account.siteName}</Text>
      </View>
    </>
  );
}

function RentTable({ bill, thermal }: { bill: BillDetail; thermal: boolean }) {
  const { lines } = bill.frozen;

  return (
    <View style={styles.block}>
      {!thermal && (
        <View style={styles.headRow}>
          <Text style={styles.item}>Item</Text>
          <Text style={styles.qty}>Qty</Text>
          <Text style={styles.date}>From</Text>
          <Text style={styles.date}>To</Text>
          <Text style={styles.days}>Days</Text>
          <Text style={styles.rate}>Rate/day</Text>
          <Text style={styles.amount}>Amount</Text>
        </View>
      )}

      {lines.map((line, index) =>
        thermal ? (
          <View key={`${line.lotId}-${index}`} style={{ paddingVertical: 1 }}>
            <Text>{line.itemName}</Text>
            <View style={styles.row}>
              <Text style={{ flex: 2 }}>
                {line.qty} × {line.days}d @ {formatPaise(line.ratePerDay, { paiseDigits: true })}
              </Text>
              <Text style={styles.amount}>{formatPaise(line.amount)}</Text>
            </View>
          </View>
        ) : (
          <View key={`${line.lotId}-${index}`} style={styles.lineRow}>
            <Text style={styles.item}>{line.itemName}</Text>
            <Text style={styles.qty}>{line.qty}</Text>
            <Text style={styles.date}>{formatDay(line.from)}</Text>
            <Text style={styles.date}>{line.to ? formatDay(line.to) : '(open)'}</Text>
            <Text style={styles.days}>{line.days}</Text>
            <Text style={styles.rate}>{formatPaise(line.ratePerDay, { paiseDigits: true })}</Text>
            <Text style={styles.amount}>{formatPaise(line.amount)}</Text>
          </View>
        ),
      )}

      {lines.length === 0 && <Text style={styles.muted}>No rent accrued in this period.</Text>}

      {bill.frozen.damageLines.map((line) => (
        <View key={line.movementId} style={styles.lineRow}>
          <Text style={{ flex: 4 }}>
            {line.type === 'LOST' ? 'Lost' : 'Damaged'}: {line.itemName} × {line.qty} @{' '}
            {formatPaise(line.unitCharge)}
          </Text>
          <Text style={styles.amount}>{formatPaise(line.amount)}</Text>
        </View>
      ))}

      {bill.frozen.adjustments.map((adjustment) => (
        <View key={adjustment.id} style={styles.lineRow}>
          <Text style={{ flex: 4 }}>
            {adjustment.reason} ({adjustment.kind})
          </Text>
          <Text style={styles.amount}>
            {adjustment.kind === 'credit' ? '−' : ''}
            {formatPaise(adjustment.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Totals({ bill }: { bill: BillDetail }) {
  return (
    <View>
      <TotalLine label="Rent" value={bill.rentTotal} />
      {bill.damageTotal > 0 && <TotalLine label="Damages" value={bill.damageTotal} />}
      {bill.chargesTotal > 0 && <TotalLine label="Charges" value={bill.chargesTotal} />}
      {bill.creditsTotal > 0 && <TotalLine label="Credits" value={-bill.creditsTotal} />}

      <View style={[styles.totalRow, styles.rule]}>
        <Text style={[styles.totalLabel, styles.grand]}>Total</Text>
        <Text style={[styles.totalValue, styles.grand]}>{formatPaise(bill.grandTotal)}</Text>
      </View>

      {bill.allocated > 0 && <TotalLine label="Less: received" value={-bill.allocated} />}

      <View style={[styles.totalRow, styles.rule]}>
        <Text style={[styles.totalLabel, styles.grand]}>Due</Text>
        <Text style={[styles.totalValue, styles.grand]}>{formatPaise(bill.outstanding)}</Text>
      </View>
    </View>
  );
}

function TotalLine({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{formatPaise(value)}</Text>
    </View>
  );
}

export async function renderBillPdf(bill: BillDetail, format: BillFormat): Promise<Buffer> {
  return renderToBuffer(<BillDocument bill={bill} format={format} />);
}
