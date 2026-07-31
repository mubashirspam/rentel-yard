'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * The "+" button. One thumb-reachable spot that opens the four things an
 * admin starts most often, so nobody has to hunt through tabs to begin an
 * issue, a return, a payment, or a new customer.
 */

const ACTIONS = [
  {
    href: '/issue?new=1',
    label: 'New issue',
    hint: 'Equipment going out',
    icon: (
      <path d="M4 17V7a1 1 0 0 1 1-1h9v11H4zm10 0h3.5L20 13.5V10h-6v7zm-8.5 3.5A1.75 1.75 0 1 0 5.5 17a1.75 1.75 0 0 0 0 3.5zm11 0A1.75 1.75 0 1 0 16.5 17a1.75 1.75 0 0 0 0 3.5z" />
    ),
  },
  {
    href: '/return',
    label: 'Record return',
    hint: 'Equipment coming back',
    icon: (
      <path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" />
    ),
  },
  {
    href: '/payments/new',
    label: 'Record payment',
    hint: 'Cash, UPI, bank, cheque',
    icon: (
      <path d="M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
    ),
  },
  {
    href: '/customers/new',
    label: 'Add customer',
    hint: 'A new contractor',
    icon: (
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" />
    ),
  },
] as const;

export function Fab() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Navigating from a menu tap must dismiss the sheet. Keyed off the pathname
  // rather than closed in an effect: setting state from an effect makes React
  // render twice for every navigation, and the lint rule is right to say so.
  const [openedAt, setOpenedAt] = useState(pathname);
  const showing = open && openedAt === pathname;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-20 mx-auto w-full max-w-2xl px-4">
      <div className="relative flex justify-end">
        {showing && (
          <>
            <button
              type="button"
              aria-label="Close quick actions"
              className="pointer-events-auto fixed inset-0 z-10 cursor-default bg-ink/30"
              onClick={() => setOpen(false)}
            />
            <ul className="pointer-events-auto absolute bottom-16 right-0 z-20 w-64 overflow-hidden rounded-2xl border border-rule bg-card shadow-xl">
              {ACTIONS.map((action) => (
                <li key={action.href} className="border-b border-rule last:border-b-0">
                  <Link href={action.href} className="tap flex items-center gap-3 px-4 py-3 hover:bg-paper">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-steel-soft text-steel">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
                        {action.icon}
                      </svg>
                    </span>
                    <span>
                      <span className="block font-medium">{action.label}</span>
                      <span className="block text-xs text-ink-2">{action.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        <button
          type="button"
          aria-expanded={showing}
          aria-label={showing ? 'Close quick actions' : 'Quick actions'}
          onClick={() => {
            setOpenedAt(pathname);
            setOpen(!showing);
          }}
          className={`pointer-events-auto relative z-20 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform ${
            showing ? 'rotate-45 bg-ink' : 'bg-steel hover:bg-steel-strong'
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-7 w-7" aria-hidden>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}
