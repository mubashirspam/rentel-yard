/**
 * The dashboard's frame while it is being assembled.
 *
 * Home is the most expensive screen in the product — `getDashboard` opens with
 * the accounts query and then fans out into seven more, one of which fans out
 * into four — so it is the screen that most needs to say "coming" rather than
 * nothing at all.
 *
 * The route group exists only to give this file somewhere to live: `/` needs a
 * loading boundary of its own, and a `loading.tsx` sitting directly in `app/`
 * would be inherited by every other route in the app. `(home)` adds no URL
 * segment — the dashboard is still `/`.
 */

import { Card } from '@/components/ui/layout';
import { Bar, LoadingScreen, SiteCard, TitleBar } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      {/* The out-on-hire card keeps its steel. The card is the same shape and
          colour on every single load — only the number inside it is unknown, so
          there is nothing gained by greying out the part we are sure of. */}
      <Card className="border-steel/20 bg-gradient-to-br from-steel to-steel-strong p-4">
        <Bar className="h-4 w-24 bg-white/25" />
        <Bar className="mt-2 h-8 w-40 bg-white/30" />
        <Bar className="mt-2 h-4 w-32 bg-white/25" />
      </Card>

      {/* Billed / not billed / received / not received. */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="p-3">
            <Bar className="h-3 w-16" />
            <Bar className="mt-2 h-5 w-24" />
          </Card>
        ))}
      </div>

      <TitleBar />
      <div className="space-y-2.5">
        <SiteCard />
        <SiteCard sites={1} />
      </div>
    </LoadingScreen>
  );
}
