/// <reference lib="webworker" />

/**
 * The app shell service worker (§07.1).
 *
 * Cache-first for the shell — JS, CSS, fonts — so the app opens with no signal
 * at all. **Never** cache-first for data: a yard worker looking at a stale
 * outstanding figure and believing it is worse than one who cannot see it, so
 * `/api/*` is network-only and the screens stamp their own freshness (§07.5).
 *
 * Serwist compiles this into the real worker at build time.
 */

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Money, balances, and stock must never be served from a cache without a
      // timestamp beside them. The outbox is what makes the app usable offline,
      // not a cached API response.
      matcher: ({ url }) => url.pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
