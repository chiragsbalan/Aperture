'use client';

import { oauthErrorMessage } from '@/lib/google-oauth-errors';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';

interface AuthFormProps {
  mode: 'login' | 'signup';
  initialError?: string | null;
}

function errorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (typeof first?.msg === 'string') {
        return first.msg;
      }
    }
  }
  return fallback;
}

export function AuthForm({ mode, initialError = null }: AuthFormProps) {
  const router = useRouter();
  const emailId = useId();
  const usernameId = useId();
  const identifierId = useId();
  const passwordId = useId();
  const errorId = useId();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    oauthErrorMessage(initialError),
  );
  const [pending, setPending] = useState(false);

  const isSignup = mode === 'signup';
  const title = isSignup ? 'Create your account' : 'Welcome back';
  const submitLabel = isSignup ? 'Sign up' : 'Log in';
  const endpoint = isSignup ? '/api/auth/register' : '/api/auth/login';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const body = isSignup
        ? { email, username, password }
        : { identifier, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          errorMessage(
            data,
            isSignup ? 'Could not create account' : 'Could not log in',
          ),
        );
        return;
      }
      router.push('/account');
      router.refresh();
    } catch {
      setError('Network error — try again');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-muted">
        {isSignup
          ? 'Choose a username, then register with email and password.'
          : 'Sign in with your email or username and password.'}
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
        noValidate
      >
        {isSignup ? (
          <>
            <div>
              <label
                htmlFor={usernameId}
                className="mb-1.5 block text-sm text-foreground"
              >
                Username
              </label>
              <input
                id={usernameId}
                name="username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9_]{3,32}"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-foreground outline-none"
              />
              <p className="mt-1.5 text-sm text-muted">
                3–32 characters: letters, digits, underscore.
              </p>
            </div>
            <div>
              <label
                htmlFor={emailId}
                className="mb-1.5 block text-sm text-foreground"
              >
                Email
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-foreground outline-none"
              />
            </div>
          </>
        ) : (
          <div>
            <label
              htmlFor={identifierId}
              className="mb-1.5 block text-sm text-foreground"
            >
              Email or username
            </label>
            <input
              id={identifierId}
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-foreground outline-none"
            />
          </div>
        )}

        <div>
          <label
            htmlFor={passwordId}
            className="mb-1.5 block text-sm text-foreground"
          >
            Password
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-2.5 text-foreground outline-none"
          />
          {isSignup ? (
            <p className="mt-1.5 text-sm text-muted">At least 8 characters.</p>
          ) : null}
        </div>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-sm text-[var(--color-danger)]"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 font-medium text-[#1a140c] transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? 'Please wait…' : submitLabel}
        </button>
      </form>

      <div className="mt-5">
        <a
          href="/api/auth/google/start?intent=sign_in"
          className="flex w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-[var(--color-accent)]"
        >
          Continue with Google
        </a>
      </div>

      <p className="mt-6 text-sm text-muted">
        {isSignup ? (
          <>
            Already have an account?{' '}
            <Link
              href="/login"
              className="text-foreground underline-offset-2 hover:underline"
            >
              Log in
            </Link>
          </>
        ) : (
          <>
            Need an account?{' '}
            <Link
              href="/signup"
              className="text-foreground underline-offset-2 hover:underline"
            >
              Sign up
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
