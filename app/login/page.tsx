'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { FormError, TextInput } from '@/components/ui/field';
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

      <button
        type="submit"
        disabled={busy}
        className="tap w-full rounded-xl bg-steel px-4 py-2 text-base font-semibold text-white transition-colors hover:bg-steel-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh w-full flex-1 flex-col justify-center overflow-hidden px-5 py-10">
      {/* Three slow blurred shapes on the yard's own palette. Decoration, so
          hidden from anything that reads the page aloud. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <span className="blob blob-a -left-24 top-[-10%] h-72 w-72 bg-steel/25" />
        <span className="blob blob-b -right-20 top-1/3 h-80 w-80 bg-green/20" />
        <span className="blob blob-c bottom-[-15%] left-1/4 h-72 w-72 bg-amber/15" />
      </div>

      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* The same mark as the home-screen icon, so the app a yard installs
              and the screen it opens on are recognisably one thing. */}
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-steel text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9" aria-hidden>
              <path d="M4 4h3.2l4.8 6.4L16.8 4H20l-6.4 8.5V20h-3.2v-7.5z" />
            </svg>
          </span>

          <h1 className="text-2xl font-bold tracking-tight">Bismi Rental</h1>
          <p className="mt-1 text-sm text-ink-2">
            Sign in to record lendings, returns, and payments.
          </p>
        </div>

        <div className="rounded-2xl border border-rule bg-card/90 p-5 backdrop-blur">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-sm text-ink-3">
          Customers do not sign in. Ask the yard for a statement link, or check your account with
          your mobile number.
        </p>
      </div>
    </main>
  );
}
