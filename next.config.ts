import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

/**
 * §07.1 / §13 M5 — the PWA *is* the mobile app. No Flutter, no native shell:
 * it installs to the home screen and opens with the network off.
 *
 * Disabled in development, where a service worker holding a stale bundle is
 * only ever a source of confusion.
 */
const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {};

/**
 * Serwist is not even initialised in development.
 *
 * `disable: true` is not enough on Next 16: the plugin still puts a `webpack`
 * key on the config, and Turbopack — the default since 16 — refuses to start
 * when it finds one with no matching `turbopack` config. Calling
 * `withSerwistInit()` at all also prints a Turbopack warning on every dev boot.
 * Since the worker is switched off in development anyway, the honest fix is to
 * skip the plugin there rather than silence what it says.
 *
 * The production build pins webpack (`next build --webpack`) because Serwist 9
 * has no Turbopack equivalent yet: under Turbopack the build *succeeds* and
 * quietly emits no service worker, which is the worst way for a PWA to fail.
 */
export default isDev
  ? nextConfig
  : withSerwistInit({
      swSrc: 'app/sw.ts',
      swDest: 'public/sw.js',
      reloadOnOnline: false,
    })(nextConfig);
