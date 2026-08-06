/**
 * Lend, waiting.
 *
 * The tab now lands on the form rather than on a list, so the frame is the
 * form's: choose who, then the items with their steppers, then the sticky bar
 * that adds them up. `listStock` and every open khata are what is being waited
 * for.
 *
 * The bar at the bottom is drawn in place and left grey. It is the control the
 * thumb is already reaching for, and having it appear late — after the items
 * have pushed the page down — is what makes a screen feel like it jumped.
 */

import { Card } from '@/components/ui/layout';
import { Bar, LoadingScreen, TitleBar } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      {/* Choose or add customer. */}
      <TitleBar />
      <Card className="p-4">
        <Bar className="h-11 w-full rounded-xl" />
        <div className="mt-3 space-y-2">
          <Bar className="h-4 w-32" />
          <Bar className="h-4 w-24" />
        </div>
      </Card>

      {/* What is going out? */}
      <TitleBar />
      <Bar className="mb-3 h-11 w-full rounded-xl" />
      <Card>
        <ul className="divide-y divide-rule">
          {Array.from({ length: 5 }, (_, index) => (
            <li key={index} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <Bar className="h-4 w-36" />
                <div className="mt-1.5 flex gap-1.5">
                  <Bar className="h-5 w-16 rounded-full" />
                  <Bar className="h-5 w-20 rounded-full" />
                </div>
              </span>
              <Bar className="h-8 w-24 shrink-0 rounded-lg" />
            </li>
          ))}
        </ul>
      </Card>

      <div className="sticky bottom-16 mt-4 rounded-2xl border border-rule bg-card p-3">
        <Bar className="h-11 w-full rounded-xl" />
      </div>
    </LoadingScreen>
  );
}
