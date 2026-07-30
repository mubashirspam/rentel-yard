'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/field';
import { signOut } from '@/lib/auth/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
