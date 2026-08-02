'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button, FormError, TextInput } from '@/components/ui/field';
import { signIn } from '@/lib/auth/client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);

    const result = await signIn.email({ email, password });

    if (result.error) {
      // Never distinguish "no such email" from "wrong password".
      setError('That email and password do not match.');
      setBusy(false);
      return;
    }

    router.push(params.get('next') ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate>
      <FormError>{error}</FormError>

      <TextInput
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <TextInput
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-12">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Bismi Rental</h1>
      <p className="mb-8 text-sm text-ink-2">Sign in to record issues, returns, and payments.</p>

      <div className="rounded border border-rule bg-card p-5">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>

      <p className="mt-6 text-sm text-ink-3">
        Customers do not sign in. Ask the yard for a statement link, or check your account with your
        mobile number.
      </p>
    </main>
  );
}
