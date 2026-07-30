'use client';

/**
 * Browser-side auth client. Sign in and sign out only — everything else goes
 * through the guarded API routes.
 */

import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

export const { signIn, signOut, useSession } = authClient;
