/**
 * The PDF font. react-pdf's built-in Helvetica has no ₹ sign, so amounts came
 * out as "¹1,260". Noto Sans (SIL Open Font License) has it.
 *
 * The files are read from disk at render time; `next.config.ts` traces
 * `lib/bills/fonts` into the serverless bundle so they are there in production.
 */

import path from 'node:path';

import { Font } from '@react-pdf/renderer';

export const PDF_FONT = 'NotoSans';

const dir = path.join(process.cwd(), 'lib', 'bills', 'fonts');

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: path.join(dir, 'NotoSans-Regular.ttf'), fontWeight: 400 },
      { src: path.join(dir, 'NotoSans-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Long invoice numbers and site names wrap on spaces, never mid-word.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

/**
 * pdfkit names each embedded font subset with six random capitals
 * ("QZXKRB+NotoSans-Regular"), which would make two renders of the same bill
 * differ. Swap in a fixed tag of the same length, so every byte offset in the
 * file's cross-reference table still holds.
 */
export function pinFontTags(pdf: Buffer): Buffer {
  const text = pdf.toString('latin1').replace(/\/[A-Z]{6}\+NotoSans-/g, '/BISMIF+NotoSans-');
  return Buffer.from(text, 'latin1');
}
