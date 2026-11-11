import { fail } from '@/lib/api/respond';
import { requireCapability, requireSession } from '@/lib/auth/guard';
import { qrPng, type BillPayInfo } from '@/lib/bills/pay-info';
import { getCustomerStatement, type StatementScope } from '@/lib/bills/statement';
import { renderStatementPdf } from '@/lib/bills/statement-pdf';
import { today } from '@/lib/clock';
import { hasBank, hasUpi, upiPayUri } from '@/lib/payments/upi';
import { loadPaymentDetails } from '@/lib/settings/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A customer's bills in one PDF. `?scope=unpaid` keeps only the bills still
 * owing; the default is every bill with the payments taken.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireSession();
    requireCapability(session, 'money.view');

    const { id } = await context.params;
    const scope: StatementScope =
      new URL(request.url).searchParams.get('scope') === 'unpaid' ? 'unpaid' : 'all';

    const asOf = today();
    const [statement, details] = await Promise.all([
      getCustomerStatement(session, id, asOf, scope),
      loadPaymentDetails(session.orgId),
    ]);

    const amount = statement.totals.outstanding;
    const upiUri =
      hasUpi(details) && amount > 0
        ? upiPayUri({
            upiId: details.upiId,
            payeeName: details.payeeName ?? statement.org.name,
            amount,
            note: `Statement ${statement.customer.name}`,
          })
        : null;
    const info: BillPayInfo = {
      amount,
      url: '',
      upiUri,
      details,
      hasDetails: hasUpi(details) || hasBank(details),
    };
    const pdf = await renderStatementPdf(statement, {
      info,
      qr: upiUri ? await qrPng(upiUri) : null,
    });

    const name = `Statement-${statement.customer.name.replace(/[^A-Za-z0-9]+/g, '-')}-${asOf}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${name}"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
