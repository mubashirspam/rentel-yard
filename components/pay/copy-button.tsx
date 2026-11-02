'use client';

import { useState } from 'react';

/** Copies a value (UPI ID, account number, IFSC) and says so. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard blocked (old browser): the value is selectable anyway.
        }
      }}
      className="min-h-11 shrink-0 rounded-xl bg-[#edf0ff] px-3 text-xs font-semibold text-[#5265d6]"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}
