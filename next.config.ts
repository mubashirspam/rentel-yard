import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

/**
 * §07.1 / §13 M5 — the PWA *is* the mobile app. No Flutter, no native shell:
 * it installs to the home screen and opens with the network off.
 *
 * Disabled in development, where a service worker holding a stale bundle is
 * only ever a source of confusion.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  reloadOnOnline: false,
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
