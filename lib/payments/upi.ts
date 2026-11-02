/**
 * UPI pay links and the payment details shown to customers (D70).
 *
 * Still **nothing is collected here** — see `service.ts`. A UPI link only opens
 * the customer's own app (Google Pay, PhonePe, Paytm, BHIM…) with the yard's
 * UPI ID, the amount and the invoice number filled in. The money goes straight
 * to the yard's account; staff record the payment as they always have.
 */

/** What the yard tells customers about where to pay. All optional. */
export interface PaymentDetails {
  payeeName: string | null;
  upiId: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
}

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = {
  payeeName: null,
  upiId: null,
  bankName: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
};

/** `name@bank` — the shape every UPI app accepts. */
export const UPI_ID_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,63}$/;

/** Indian Financial System Code: 4 letters, a zero, 6 letters or digits. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Account numbers in India run 9–18 digits. */
export const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;

export function hasUpi(details: PaymentDetails): details is PaymentDetails & { upiId: string } {
  return Boolean(details.upiId);
}

export function hasBank(details: PaymentDetails): boolean {
  return Boolean(details.bankAccountNumber && details.bankIfsc);
}

/**
 * Rupees with exactly two decimals, from integer paise — no floats (README
 * rule 3). UPI's `am` parameter wants "795.00".
 */
export function paiseToUpiAmount(paise: number): string {
  if (!Number.isInteger(paise) || paise < 0) throw new Error('Amount must be whole paise, ≥ 0.');
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `${rupees}.${rest.toString().padStart(2, '0')}`;
}

export interface UpiPayInput {
  upiId: string;
  payeeName: string;
  /** Paise. Omitted or 0 lets the customer type the amount. */
  amount?: number;
  /** Shows in the customer's app and on the yard's statement. */
  note?: string;
}

/**
 * The standard UPI deep link, e.g.
 * `upi://pay?pa=bismi@okaxis&pn=Bismi%20Rental&am=795.00&cu=INR&tn=INV-2026-0003`.
 */
export function upiPayUri(input: UpiPayInput): string {
  const params = new URLSearchParams();
  params.set('pa', input.upiId.trim());
  params.set('pn', input.payeeName.trim().slice(0, 50));
  if (input.amount && input.amount > 0) params.set('am', paiseToUpiAmount(input.amount));
  params.set('cu', 'INR');
  if (input.note) params.set('tn', input.note.trim().slice(0, 80));
  // URLSearchParams writes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}
