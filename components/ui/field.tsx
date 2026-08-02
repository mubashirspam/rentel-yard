/**
 * Form primitives sized for a yard: 44px touch targets, high contrast, and
 * errors that say what to do (§01, §14).
 */

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

/**
 * One shape for everything you type into or choose from.
 *
 * `rounded-xl` matches the tiles and the app bar; a 4px input beside a 16px
 * card is the difference between an app and a web form. A native `<select>`
 * ignores most of this on iOS unless `appearance-none` takes its chrome away,
 * so the chevron below is drawn by us and the box is identical to a text field.
 */
const CONTROL =
  'tap w-full rounded-xl border border-rule bg-card px-3 py-2 text-base text-ink ' +
  'outline-none transition-colors focus:border-steel focus:ring-2 focus:ring-steel/25 ' +
  'disabled:bg-paper disabled:text-ink-3';

export function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink-2">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-red">
      {children}
    </p>
  );
}

export function TextInput({
  label,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; id: string }) {
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      <span id={`${id}-error`}>
        <FieldError>{error}</FieldError>
      </span>
    </div>
  );
}

export function Select({
  label,
  error,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; id: string }) {
  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>

      <div className="relative">
        <select id={id} className={`${CONTROL} appearance-none pr-10`} {...props}>
          {children}
        </select>

        {/* Ours, not the platform's — so the field is the same box as a text
            input on every phone in the yard. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      <FieldError>{error}</FieldError>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  ...props
}: InputHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-steel text-white hover:bg-steel-strong'
      : 'border border-rule bg-card text-ink hover:bg-paper';

  return (
    <button
      className={`tap cursor-pointer rounded-xl px-4 py-2 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** The one place a form-level failure is rendered, so copy stays consistent. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red/30 bg-red-soft px-3 py-2 text-sm text-red">
      {children}
    </div>
  );
}
