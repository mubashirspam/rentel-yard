/**
 * Loading placeholders.
 *
 * Every admin screen is `force-dynamic` and reads from Neon in Singapore, so a
 * navigation costs a real round trip no amount of client work removes. What can
 * be removed is the *silence*: without a loading boundary the router holds the
 * previous screen fully painted until the whole payload lands, so the tab bar
 * does not even move and a tap reads as a tap that missed.
 *
 * These shapes exist to be the answer to that. They are also what Next can
 * prefetch — a dynamic route has no prefetchable shell until it has a
 * `loading.tsx`, so adding one turns the five tab links from no-ops into links
 * that arrive with their frame already on screen.
 *
 * The rule they follow: hold the same space the real content will take. A
 * skeleton that is the wrong height moves the page under a thumb that has
 * already started reaching, which is worse than the blank it replaced.
 *
 * One trap, found by measuring the prefetched payloads rather than reasoning
 * about them: a `loading.tsx` placed directly in `app/` becomes the shell for
 * *every* route, and the per-route files below it are then never what gets
 * prefetched — all five tabs came back byte-identical. There is deliberately no
 * root boundary for that reason, which is also why the dashboard lives in the
 * `(home)` route group: it is the only way for `/` to have a boundary of its
 * own. A screen that wants one adds its own `loading.tsx`; it does not inherit.
 */

import { Card, Screen } from './layout';

/**
 * One pulsing block. `bg-rule` rather than a grey — the placeholder should read
 * as the page's own furniture waiting, not as a foreign element.
 *
 * §08.5 caps state transitions at 150ms; a pulse is not a state transition but
 * ambient motion, and Tailwind's 2s cycle is slow enough to sit under text
 * without pulling the eye. `motion-reduce` stills it entirely.
 */
export function Bar({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block animate-pulse rounded-md bg-rule motion-reduce:animate-none ${className}`}
    />
  );
}

/** The app bar's shape, so the header does not pop in over the content. */
export function HeaderBar({ back = false }: { back?: boolean }) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 rounded-b-2xl border-b border-rule bg-card/95 px-4 backdrop-blur">
      <div className="flex h-14 items-center gap-2">
        {back && <Bar className="-ml-2 h-5 w-5 shrink-0" />}
        <Bar className="h-4 w-32" />
      </div>
    </div>
  );
}

/** A section heading: the coloured rule is real, the words are not yet. */
export function TitleBar() {
  return (
    <div className="mb-2 mt-6 flex items-center gap-2">
      <span aria-hidden className="h-3.5 w-1 rounded-full bg-ink-3" />
      <Bar className="h-3 w-28" />
    </div>
  );
}

/**
 * The search box and range select `SiteBrowser` puts above its cards.
 *
 * 44px tall, matching `tap`, because this is the band a thumb lands in and it
 * must not shift by even a few pixels when the real controls arrive.
 */
export function FilterRow() {
  return (
    <div className="mb-3 flex gap-2">
      <Bar className="h-11 flex-1 rounded-xl" />
      <Bar className="h-11 w-24 shrink-0 rounded-xl" />
    </div>
  );
}

/**
 * A site card: contractor band, then the sites under it. Used by Home and by
 * the two movement screens, which all group the same way.
 */
export function SiteCard({ sites = 2 }: { sites?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-paper px-4 py-2.5">
        <Bar className="h-4 w-32" />
        <Bar className="h-4 w-20 shrink-0" />
      </div>
      <ul className="divide-y divide-rule">
        {Array.from({ length: sites }, (_, index) => (
          <li key={index} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <Bar className="h-4 w-28" />
              <Bar className="h-4 w-16 shrink-0" />
            </div>
            <div className="mt-2 flex gap-1.5">
              <Bar className="h-5 w-16 rounded-full" />
              <Bar className="h-5 w-20 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * A contractor card: name and scale on the left, what they owe on the right,
 * chips beneath. The shape Home and Customers both list.
 */
export function ContractorCard() {
  return (
    <Card className="p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1">
          <Bar className="h-4 w-28" />
          <Bar className="mt-1.5 h-3 w-20" />
        </span>
        <Bar className="h-4 w-16 shrink-0" />
      </div>
      <div className="mt-2.5 flex gap-1.5">
        <Bar className="h-5 w-20 rounded-full" />
        <Bar className="h-5 w-24 rounded-full" />
      </div>
    </Card>
  );
}

/**
 * The whole frame for a tab destination.
 *
 * Wraps `Screen`, so the tab bar and the sync chip are on screen the instant a
 * tab is tapped and the active pill slides straight away — which is the entire
 * point of the exercise. The chrome never blinks; only the content below it is
 * standing in for something.
 */
export function LoadingScreen({ children, back = false }: { children: React.ReactNode; back?: boolean }) {
  return (
    <Screen>
      <HeaderBar back={back} />
      {children}
      <span className="sr-only" role="status">
        Loading
      </span>
    </Screen>
  );
}
