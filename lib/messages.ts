/**
 * The messages an admin sends a contractor (§09).
 *
 * There is no WhatsApp Business API here — it costs money and needs approval.
 * These build the *text*; the admin taps once and sends it from their own
 * WhatsApp, which also means a human reads every message before it goes to
 * someone they know personally.
 *
 * ## Two languages
 *
 * The screens stay English: staff read them all day and the vocabulary is
 * fixed. A statement is different — it goes to a contractor in Kerala, and a
 * bill he cannot read is a bill he has to ring up about. So every template
 * exists in English and Malayalam, chosen per yard in settings.
 *
 * Money and dates are left in the formats `formatPaise` and `formatDayFull`
 * produce. A contractor reads ₹5,700 and 30-Jun-2026 without help; transliterating
 * either would make them harder, not easier.
 *
 * > The Malayalam below should be read once by a native speaker before the
 * > first message goes out. It is careful, but "careful" is not the same as
 * > "how the yard actually says it", and the yard's own phrasing will land
 * > better than a correct translation.
 *
 * Pure, so the same wording can be used by a screen, a share sheet, and later
 * the reminder queue without drifting.
 */

import { formatDay, formatDayFull } from './format';
import { formatPaise } from './money';

/** English, or Malayalam for the contractor. */
export type MessageLanguage = 'en' | 'ml';

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
  language?: MessageLanguage;
}

export function statementMessage(input: StatementMessageInput): string {
  const items = input.outstandingItems
    .map((line) => `${line.qtyOut} × ${line.itemName}`)
    .join(', ');

  if (input.language === 'ml') {
    return [
      `${input.yardName} — ${input.siteName} കണക്ക്`,
      items ? `പുറത്തുള്ള സാധനങ്ങൾ: ${items}` : 'സൈറ്റിൽ ഒന്നും ബാക്കിയില്ല.',
      `അടയ്ക്കാനുള്ള തുക: ${formatPaise(input.balance)} (${formatDayFull(input.asOf)} വരെ)`,
      input.portalUrl ? `പൂർണ വിവരം: ${input.portalUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

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
  language?: MessageLanguage;
}

export function billMessage(input: BillMessageInput): string {
  if (input.language === 'ml') {
    return [
      `${input.yardName} — ബിൽ ${input.invoiceNo}`,
      `${input.siteName} · ${formatDay(input.periodFrom)} മുതൽ ${formatDayFull(input.periodTo)} വരെ`,
      `ആകെ തുക: ${formatPaise(input.grandTotal)}`,
      input.outstanding !== input.grandTotal
        ? `ഈ ബില്ലിൽ ബാക്കി: ${formatPaise(input.outstanding)}`
        : null,
      input.dueOn ? `അടയ്ക്കേണ്ട അവസാന തീയതി: ${formatDayFull(input.dueOn)}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

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
  language?: MessageLanguage;
}

export function receiptMessage(input: ReceiptMessageInput): string {
  if (input.language === 'ml') {
    return [
      `${input.yardName} — പണം ലഭിച്ചു`,
      `${formatPaise(input.amount)} · ${input.method} · ${formatDayFull(input.paidOn)}`,
      `സൈറ്റ്: ${input.siteName}`,
      input.balance > 0
        ? `ഇനി ബാക്കി: ${formatPaise(input.balance)}`
        : 'നിങ്ങളുടെ കണക്ക് പൂർണമായി തീർന്നു. നന്ദി.',
    ].join('\n');
  }

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
  language?: MessageLanguage;
}

/**
 * Deliberately plain. A reminder that reads like a legal notice costs a yard
 * more in goodwill than the invoice is worth — in either language.
 */
export function reminderMessage(input: ReminderMessageInput): string {
  if (input.language === 'ml') {
    return [
      `${input.customerName}, ${input.yardName}-ൽ നിന്നുള്ള ഒരു ഓർമ്മപ്പെടുത്തൽ.`,
      `${input.siteName}-ലെ ബിൽ ${input.invoiceNo}-ൽ ${formatPaise(input.outstanding)} ബാക്കിയുണ്ട്${
        input.dueOn ? `, അവസാന തീയതി ${formatDayFull(input.dueOn)}` : ''
      }.`,
      'എപ്പോൾ അടയ്ക്കാൻ കഴിയുമെന്ന് അറിയിക്കാമോ?',
    ].join('\n');
  }

  return [
    `${input.customerName}, a reminder from ${input.yardName}.`,
    `Invoice ${input.invoiceNo} for ${input.siteName} has ${formatPaise(input.outstanding)} pending${
      input.dueOn ? `, due on ${formatDayFull(input.dueOn)}` : ''
    }.`,
    'Please let us know when it can be settled.',
  ].join('\n');
}
