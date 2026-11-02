import { describe, expect, it } from 'vitest';

import { billMessage } from './messages';

const BASE = {
  yardName: 'Bismi Rental',
  invoiceNo: 'INV-2026-0003',
  siteName: 'Home',
  periodFrom: '2026-10-01',
  periodTo: '2026-10-31',
  grandTotal: 470000,
  outstanding: 470000,
  dueOn: null,
};

describe('billMessage (D70)', () => {
  it('lists the items and ends with the pay link while money is owed', () => {
    const text = billMessage({
      ...BASE,
      lines: [{ itemName: 'KD sheet', qty: 45, days: 31, amount: 279000 }],
      payUrl: 'https://bismirentel.vercel.app/pay/abc.def',
    });
    expect(text).toContain('• KD sheet × 45 · 31 days — ');
    expect(text.split('\n').at(-1)).toMatch(
      /^💳 Pay .+4,700 \(UPI \/ QR \/ bank\): https:\/\/bismirentel\.vercel\.app\/pay\/abc\.def$/,
    );
  });

  it('drops the pay line once the bill is paid', () => {
    const text = billMessage({ ...BASE, outstanding: 0, payUrl: 'https://x/pay/a.b' });
    expect(text).not.toContain('💳');
  });

  it('is unchanged when no lines or link are passed', () => {
    expect(billMessage(BASE)).not.toContain('•');
  });
});
