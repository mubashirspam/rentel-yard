/**
 * Form primitives sized for a yard: 44px touch targets, high contrast, and
 * errors that say what to do (§01, §14).
 */

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const CONTROL =
  'tap w-full rounded-xl border border-rule bg-card px-3 py-2 text-base text-ink shadow-sm ' +
  'outline-none focus:border-steel focus:ring-2 focus:ring-steel/25 ' +
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
      <select id={id} className={CONTROL} {...props}>
        {children}
      </select>
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
      ? 'bg-steel text-white shadow-sm hover:bg-steel-strong'
      : 'border border-rule bg-card text-ink shadow-sm hover:bg-paper';

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
