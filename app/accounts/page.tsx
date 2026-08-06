/**
 * Gone, as a screen. Kept, as a URL.
 *
 * `/accounts` listed every khata grouped under its contractor and split by what
 * still needed an invoice — which is the same list `/customers` now shows, one
 * card per person, with that split carried on the card as a chip and opened in
 * the contractor's own *To bill* tab. Two screens answering one question is
 * exactly the scatter this redesign removed.
 *
 * The path stays because links to it are saved on phones (D60). A plain server
 * redirect rather than a permanent one: a 308 would be cached on those phones
 * forever, and the day this shape changes again it should change here.
 */

import { redirect } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function AccountsPage() {
  redirect('/customers');
}
