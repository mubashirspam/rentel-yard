'use client';

import { useEffect, useState } from 'react';

/**
 * §13 M5 — the install prompt.
 *
 * Chrome fires `beforeinstallprompt` and lets us defer it to a moment that makes
 * sense; iOS Safari fires nothing at all, so it gets a one-line instruction
 * instead. Dismissal is remembered — nobody should be nagged twice.
 */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'yard-install-dismissed';

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;
    // Already running from the home screen: nothing to offer.
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onPrompt = (raw: Event) => {
      raw.preventDefault();
      setEvent(raw as InstallEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  if (!visible || !event) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-20 mx-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-rule bg-card p-4">
      <p className="font-medium">Add Yard Ledger to the home screen</p>
      <p className="mt-1 text-sm text-ink-2">
        It opens faster and keeps working when the signal drops.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            dismiss();
          }}
          className="tap inline-flex items-center rounded bg-steel px-4 py-2 font-medium text-white"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="tap inline-flex items-center rounded border border-rule px-4 py-2 font-medium"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
