import Link from 'next/link';

/**
 * What the service worker serves when a page is requested with no signal and
 * nothing cached (§07.5).
 *
 * It says what is safe rather than apologising: the queue is on the phone, and
 * the two things a yard worker needs mid-shift still open.
 */
export const metadata = { title: 'Offline — Bismi Rental' };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
      <span aria-hidden className="mb-3 block h-1 w-10 rounded-full bg-amber" />
      <h1 className="mb-2 text-2xl font-bold tracking-tight">No signal</h1>
      <p className="mb-6 text-ink-2">
        This screen needs a connection. Anything already recorded on this phone is safe — it is
        queued and will send itself the moment the signal returns.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/sync"
          className="tap inline-flex items-center rounded-xl bg-steel px-4 py-2 font-medium text-white"
        >
          See what is waiting
        </Link>
        <Link
          href="/"
          className="tap inline-flex items-center rounded-xl border border-rule bg-card px-4 py-2 font-medium"
        >
          Try again
        </Link>
      </div>
    </main>
  );
}
