'use client';

/**
 * Browser-side auth client. Sign in and sign out only — everything else goes
 * through the guarded API routes.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  /**
   * Whatever host served this page, not a configured one.
   *
   * `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` in development, and a
   * phone on the yard's wifi loading `http://192.168.x.x:3000` would then post
   * its sign-in to *its own* localhost and fail. The app is always served from
   * the host it talks to, so the origin is the right answer everywhere —
   * laptop, phone on the LAN, preview deploy, and production alike.
   */
  baseURL: typeof window === 'undefined' ? process.env.NEXT_PUBLIC_APP_URL : window.location.origin,
});

export const { signIn, signOut, useSession } = authClient;
