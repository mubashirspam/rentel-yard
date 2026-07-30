'use client';

/**
 * Quantity stepper (§08.3 "qty stepper per row").
 *
 * Thumb-sized ± buttons because the admin is one-handed in a yard, with a
 * keyboard entry beside them because typing 200 is faster than tapping it.
 */
export function QtyStepper({
  value,
  onChange,
  max,
  label,
  hint,
}: {
  value: number;
  onChange: (value: number) => void;
  /** Upper bound, when one is known — outstanding qty on a return. */
  max?: number;
  label: string;
  hint?: string;
}) {
  function clamp(next: number): number {
    if (!Number.isFinite(next)) return 0;
    const floored = Math.max(0, Math.trunc(next));
    return max === undefined ? floored : Math.min(floored, max);
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        disabled={value <= 0}
        onClick={() => onChange(clamp(value - 1))}
        className="tap rounded border border-rule bg-card text-xl font-medium text-ink disabled:opacity-40"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(event) => onChange(clamp(Number(event.target.value.replace(/\D/g, ''))))}
        className="tap w-16 rounded border border-rule bg-card px-2 text-center text-base tabular text-ink outline-none focus:border-steel focus:ring-2 focus:ring-steel/25"
      />
      <button
        type="button"
        aria-label={`One more ${label}`}
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + 1))}
        className="tap rounded border border-rule bg-card text-xl font-medium text-ink disabled:opacity-40"
      >
        +
      </button>
      {hint && <span className="ml-1 text-xs text-ink-3">{hint}</span>}
    </div>
  );
}
