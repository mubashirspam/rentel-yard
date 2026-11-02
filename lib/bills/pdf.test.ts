/**
 * The bill PDF actually renders, in both formats, and does so deterministically.
 *
 * §09 asks for byte-identical output for the same bill id. That is worth a test
 * rather than a comment: react-pdf stamps a creation date by default, and the
 * day it starts doing so again is the day two prints of the same invoice stop
 * matching — which is exactly the situation a disputed bill cannot survive.
 */

import { describe, expect, it } from 'vitest';

import { billPayInfo, qrPng } from './pay-info';
import { renderBillPdf } from './pdf';
import type { BillDetail } from './service';

const BILL: BillDetail = {
  id: 'bill-1',
  invoiceNo: 'INV-2026-0042',
  periodFrom: '2026-06-01',
  periodTo: '2026-06-30',
  rentTotal: 580_000,
  damageTotal: 180_000,
  chargesTotal: 150_000,
  creditsTotal: 0,
  grandTotal: 910_000,
  dueOn: '2026-07-07',
  issuedAt: '2026-06-30T12:00:00.000Z',
  allocated: 500_000,
  outstanding: 410_000,
  status: 'partial',
  account: {
    id: 'account-1',
    orgId: 'org-1',
    customerId: 'customer-1',
    siteName: 'Kakkanad site',
    siteAddress: null,
    status: 'open',
    openedOn: '2026-06-01',
    closedOn: null,
  },
  customer: { id: 'customer-1', name: 'Rahim Contractor', mobile: '+919846012345' },
  org: {
    name: 'Bismi Scaffolding',
    address: 'Aluva, Ernakulam',
    phone: '+91 98460 00000',
    termsText: 'Rent is charged per day per unit.',
  },
  frozen: {
    lines: [
      {
        itemId: 'item-1',
        itemName: 'Jack 3.0m',
        lotId: 'lot-1',
        qty: 100,
        from: '2026-06-01',
        to: null,
        days: 29,
        daysBilledEarlier: 0,
        minimumDays: 5,
        rawDays: 29,
        ratePerDay: 200,
        amount: 580_000,
      },
    ],
    damageLines: [
      {
        itemId: 'item-1',
        itemName: 'Jack 3.0m',
        movementId: 'movement-1',
        type: 'RETURN_DAMAGED',
        qty: 4,
        occurredOn: '2026-06-25',
        unitCharge: 45_000,
        amount: 180_000,
        manual: false,
      },
    ],
    adjustments: [
      {
        id: 'adjustment-1',
        kind: 'charge',
        amount: 150_000,
        reason: 'Transport',
        appliedOn: '2026-06-15',
      },
    ],
    billedEarlier: 0,
    accruedToDate: 580_000,
  },
  payments: [
    {
      id: 'payment-1',
      amount: 500_000,
      paidOn: '2026-07-05',
      method: 'upi',
      reference: 'UPI/123456',
    },
  ],
};

describe('bill PDF', () => {
  it('renders an A4 document', async () => {
    const pdf = await renderBillPdf(BILL, 'a4');

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.byteLength).toBeGreaterThan(1000);
  }, 30_000);

  it('renders the 80mm thermal variant', async () => {
    const pdf = await renderBillPdf(BILL, 'thermal');

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 30_000);

  it('produces the same bytes every time', async () => {
    // Sequentially: two concurrent renders would share react-pdf's internal
    // font state, and a race there would show up here as a false failure.
    const first = await renderBillPdf(BILL, 'a4');
    const second = await renderBillPdf(BILL, 'a4');

    expect(first.equals(second)).toBe(true);
  }, 30_000);

  it('carries the pay block with a UPI QR when details are set (D70)', async () => {
    const info = billPayInfo(
      { ...BILL, id: '6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b' },
      {
        payeeName: 'Bismi Scaffolding',
        upiId: 'bismi@okaxis',
        bankName: 'SBI',
        bankAccountName: 'Bismi Scaffolding',
        bankAccountNumber: '123456789012',
        bankIfsc: 'SBIN0001234',
      },
      { appUrl: 'https://bismirentel.vercel.app', pepper: 'a-test-pepper-that-is-long-enough' },
    );
    expect(info.amount).toBe(410_000);
    expect(info.upiUri).toBe(
      'upi://pay?pa=bismi%40okaxis&pn=Bismi%20Scaffolding&am=4100.00&cu=INR&tn=INV-2026-0042',
    );

    const qr = await qrPng(info.upiUri!);
    expect(qr.startsWith('data:image/png;base64,')).toBe(true);

    for (const format of ['a4', 'thermal'] as const) {
      const pdf = await renderBillPdf(BILL, format, { info, qr });
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      // The QR image makes the file bigger than the same bill without it.
      expect(pdf.length).toBeGreaterThan((await renderBillPdf(BILL, format)).length);
    }
  });
});
