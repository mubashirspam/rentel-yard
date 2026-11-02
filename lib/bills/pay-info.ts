/**
 * What a bill tells the customer about paying it (D70): the amount still
 * owed, a UPI link for exactly that, a QR of the same link, the public pay
 * page, and the yard's bank details. Used by the PDF, the pay page and the
 * apps' WhatsApp message, so they can never disagree.
 */

import QRCode from 'qrcode';

import { serverEnv } from '../env';
import { hasBank, hasUpi, upiPayUri, type PaymentDetails } from '../payments/upi';
import { payUrl } from './pay-link';
import type { BillDetail } from './service';

export interface BillPayInfo {
  /** Paise still owed on this bill. */
  amount: number;
  /** The public `/pay/<token>` page. */
  url: string;
  /** `upi://pay?...` for the amount, or null when there is no UPI ID or nothing owed. */
  upiUri: string | null;
  details: PaymentDetails;
  /** True when there is anything to show: a UPI ID or a bank account. */
  hasDetails: boolean;
}

export function billPayInfo(
  bill: BillDetail,
  details: PaymentDetails,
  options: { appUrl?: string; pepper?: string } = {},
): BillPayInfo {
  const env = options.appUrl && options.pepper ? null : serverEnv();
  const appUrl = options.appUrl ?? env!.NEXT_PUBLIC_APP_URL;
  const pepper = options.pepper ?? env!.PORTAL_TOKEN_PEPPER;
  const amount = Math.max(0, bill.outstanding);

  return {
    amount,
    url: payUrl(appUrl, bill.id, pepper),
    upiUri:
      hasUpi(details) && amount > 0
        ? upiPayUri({
            upiId: details.upiId,
            payeeName: details.payeeName ?? bill.org.name,
            amount,
            note: bill.invoiceNo,
          })
        : null,
    details,
    hasDetails: hasUpi(details) || hasBank(details),
  };
}

/** PNG data URL, for the PDF. */
export function qrPng(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 300, errorCorrectionLevel: 'M' });
}

/** Inline SVG markup, for the pay page. */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
