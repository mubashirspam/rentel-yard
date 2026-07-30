/**
 * The messages an admin sends a contractor (§09).
 *
 * There is no WhatsApp Business API here — it costs money and needs approval.
 * These build the *text*; the admin taps once and sends it from their own
 * WhatsApp, which also means a human reads every message before it goes to
 * someone they know personally.
 *
 * Pure, so the same wording can be used by a screen, a share sheet, and later
 * the reminder queue without drifting.
 */

import { formatDay, formatDayFull } from './format';
import { formatPaise } from './money';

export interface MessageTemplate {
  id: string;
  label: string;
  text: string;
}

export interface StatementMessageInput {
  yardName: string;
  customerName: string;
  siteName: string;
  outstandingItems: Array<{ itemName: string; qtyOut: number }>;
  balance: number;
  asOf: string;
  /** The §05.4 signed link, once the portal exists (M6). */
  portalUrl?: string | null;
}

export function statementMessage(input: StatementMessageInput): string {
  const items = input.outstandingItems
    .map((line) => `${line.qtyOut} × ${line.itemName}`)
    .join(', ');

  return [
    `${input.yardName} — statement for ${input.siteName}`,
    items ? `Still out: ${items}` : 'Nothing is out on this site.',
    `Amount due: ${formatPaise(input.balance)} (as of ${formatDayFull(input.asOf)})`,
    input.portalUrl ? `Full statement: ${input.portalUrl}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface BillMessageInput {
  yardName: string;
  invoiceNo: string;
  siteName: string;
  periodFrom: string;
  periodTo: string;
  grandTotal: number;
  outstanding: number;
  dueOn: string | null;
}

export function billMessage(input: BillMessageInput): string {
  return [
    `${input.yardName} — invoice ${input.invoiceNo}`,
    `${input.siteName} · ${formatDay(input.periodFrom)} to ${formatDayFull(input.periodTo)}`,
    `Total: ${formatPaise(input.grandTotal)}`,
    input.outstanding !== input.grandTotal
      ? `Balance on this invoice: ${formatPaise(input.outstanding)}`
      : null,
    input.dueOn ? `Due by ${formatDayFull(input.dueOn)}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ReceiptMessageInput {
  yardName: string;
  customerName: string;
  siteName: string;
  amount: number;
  method: string;
  paidOn: string;
  /** What is left on the account after this payment. */
  balance: number;
}

export function receiptMessage(input: ReceiptMessageInput): string {
  return [
    `${input.yardName} — payment received`,
    `${formatPaise(input.amount)} by ${input.method} on ${formatDayFull(input.paidOn)}`,
    `Site: ${input.siteName}`,
    input.balance > 0
      ? `Balance now: ${formatPaise(input.balance)}`
      : 'Your account is fully settled. Thank you.',
  ].join('\n');
}

export interface ReminderMessageInput {
  yardName: string;
  customerName: string;
  invoiceNo: string;
  siteName: string;
  outstanding: number;
  dueOn: string | null;
}

/**
 * Deliberately plain. A reminder that reads like a legal notice costs a yard
 * more in goodwill than the invoice is worth.
 */
export function reminderMessage(input: ReminderMessageInput): string {
  return [
    `${input.customerName}, a reminder from ${input.yardName}.`,
    `Invoice ${input.invoiceNo} for ${input.siteName} has ${formatPaise(input.outstanding)} pending${
      input.dueOn ? `, due on ${formatDayFull(input.dueOn)}` : ''
    }.`,
    'Please let us know when it can be settled.',
  ].join('\n');
}
