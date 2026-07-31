import Link from 'next/link';

/**
 * The in-page filter control — "Open · All", "Not returned · Returned".
 *
 * These were two bare text links, distinguished only by weight, and they read
 * as prose rather than as a control: nothing said "these are the choices, and
 * you are on this one". Now they are a segmented control with the same filled
 * pill as the bottom tab bar, so a tab looks like a tab wherever it appears.
 *
 * Still `<Link>`s, not buttons. The filter lives in the URL, so it is
 * shareable, survives the back button, and works with no JavaScript — which
 * matters when the service worker is serving a stale shell (§07.5, D37).
 *
 * The pill does not slide here. Segments are sized to their labels rather than
 * split evenly, so sliding would need measurement; the bottom bar can slide
 * because its five tabs are equal width. Movement without measurement would
 * land the pill in the wrong place on the first paint, which is worse than no
 * movement at all.
 */
export function Segmented({
  options,
  className = '',
  onSelect,
}: {
  options: Array<{ href: string; label: string; active: boolean; count?: number }>;
  className?: string;
  /**
   * Set where the choice is *not* a URL — the bill preview's scope, which is
   * part of an unsaved draft rather than a place you can link to. The segments
   * become buttons; everywhere else they stay links.
   */
  onSelect?: (index: number) => void;
}) {
  if (onSelect) {
    return (
      <div
        role="group"
        aria-label="Filter"
        className={`inline-flex w-full max-w-md rounded-xl border border-rule bg-paper p-1 ${className}`}
      >
        {options.map((option, index) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={option.active}
            onClick={() => onSelect(index)}
            className={`tap flex flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors duration-150 ${
              option.active ? 'bg-card text-steel' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav
      aria-label="Filter"
      className={`inline-flex w-full max-w-md rounded-xl border border-rule bg-paper p-1 ${className}`}
    >
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? 'page' : undefined}
          className={`tap flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 ${
            option.active
              ? 'bg-card text-steel'
              : 'text-ink-2 hover:text-ink active:bg-card/60'
          }`}
        >
          {option.label}
          {option.count !== undefined && (
            <span
              className={`tabular rounded-full px-1.5 text-xs font-semibold ${
                option.active ? 'bg-steel-soft text-steel' : 'bg-rule/60 text-ink-2'
              }`}
            >
              {option.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
