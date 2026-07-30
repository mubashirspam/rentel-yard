import { fail } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { getBill } from '@/lib/bills/service';
import { renderBillPdf, type BillFormat } from '@/lib/bills/pdf';
import { today } from '@/lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * §09 — `?format=a4` (default) or `?format=thermal` for the 80mm printer.
 *
 * Not wrapped in `handler`, because a success here is a PDF body rather than
 * the JSON envelope; failures still go through `fail` so a 404 reads the same
 * as everywhere else.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    requireCapability(session, 'money.view');

    const { id } = await context.params;
    const format: BillFormat =
      new URL(request.url).searchParams.get('format') === 'thermal' ? 'thermal' : 'a4';

    const bill = await getBill(session, id, today());
    const pdf = await renderBillPdf(bill, format);

    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        // `inline` so a tap opens the phone's viewer rather than downloading.
        'content-disposition': `inline; filename="${bill.invoiceNo}${format === 'thermal' ? '-thermal' : ''}.pdf"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
