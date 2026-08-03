/**
 * More, waiting.
 *
 * Six tiles, not eight: an `admin` sees six, and only a `super_admin` gets
 * Items and Staff on top. Guessing low means the grid grows by one row when the
 * real screen lands rather than collapsing by one, and a grid that shrinks
 * pulls a tile out from under a thumb already on its way down.
 */

import { Card } from '@/components/ui/layout';
import { Bar, LoadingScreen, TitleBar } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <LoadingScreen>
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="flex h-full items-start gap-3 p-3.5">
            <Bar className="h-10 w-10 shrink-0 rounded-xl" />
            <span className="min-w-0 flex-1">
              <Bar className="h-4 w-20" />
              <Bar className="mt-1.5 h-3 w-16" />
            </span>
          </Card>
        ))}
      </div>

      <TitleBar />
      <Bar className="h-11 w-full rounded-xl" />
    </LoadingScreen>
  );
}
