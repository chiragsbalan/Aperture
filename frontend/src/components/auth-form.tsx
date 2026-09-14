'use client';

import { useAuth } from '@/components/auth-provider';
import { useUsernameAvailability } from '@/hooks/use-username-availability';
import { oauthErrorMessage } from '@/lib/google-oauth-errors';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';

interface AuthFormProps {
  mode: 'login' | 'signup';
  initialError?: string | null;
  /**
   * When set (e.g. in-place landing auth), footer switches modes without
   * navigating to `/login` or `/signup`.
   */
  onSwitchMode?: (mode: 'login' | 'signup') => void;
  /**
   * Focus the first text field after mount (guest landing hero only).
   * Skipped when an OAuth/initial form error already claims focus.
   * Leave unset on `/login` and `/signup` to avoid double-focus.
   */
  autoFocusFirstField?: boolean;
}

type FieldKey = 'username' | 'email' | 'identifier' | 'password';

interface FieldErrors {
  username?: string;
  email?: string;
  identifier?: string;
  password?: string;
}

const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_HINT = '3–32 characters: letters, digits, underscore.';
const EMAIL_HINT = 'Use a valid email address.';
const INVALID_IDLE_MS = 1000;
const PASSWORD_HINT = 'At least 8 characters.';
const USERNAME_TAKEN = 'This username is unavailable.';
const EMAIL_TAKEN = 'This email is unavailable.';

const INPUT_INVALID_CLASS =
  'border-[var(--color-danger)] hover:border-[var(--color-danger)] ' +
  'focus-visible:border-[var(--color-danger)] ' +
  'focus-visible:ring-[var(--color-danger)]';

type RevealField = 'username' | 'email' | 'password' | 'identifier';

/** Enter moves to the next field. The last field submits the form. */
function onFieldEnter(
  event: KeyboardEvent<HTMLInputElement>,
  next: HTMLInputElement | null,
): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) {
    return;
  }
  event.preventDefault();
  if (next) {
    next.focus();
    return;
  }
  event.currentTarget.form?.requestSubmit();
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      className={['btn-google-mark', className].filter(Boolean).join(' ')}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** Frosted field — same fill/blur as the search popup (`.overlay-surface`). */
const INPUT_CLASS =
  'overlay-surface-field w-full px-3 py-2 text-base text-foreground ' +
  'placeholder:text-muted outline-none transition ' +
  'sm:py-2.5 sm:[font-size:var(--text-body-sm)] ' +
  'hover:border-[var(--color-primary)]/40 ' +
  'focus-visible:border-[var(--color-primary)] ' +
  'focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]';

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

function fieldErrorsFromResponse(data: unknown): FieldErrors {
  const result: FieldErrors = {};
  if (typeof data !== 'object' || data === null || !('detail' in data)) {
    return result;
  }
  const detail = (data as { detail: unknown }).detail;
  if (!Array.isArray(detail)) {
    return result;
  }
  for (const item of detail) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const entry = item as { loc?: unknown; msg?: unknown };
    if (typeof entry.msg !== 'string' || !Array.isArray(entry.loc)) {
      continue;
    }
    const path = entry.loc.filter(
      (part): part is string => typeof part === 'string',
    );
    const key = path.find(
      (part): part is FieldKey =>
        part === 'username' ||
        part === 'email' ||
        part === 'identifier' ||
        part === 'password',
    );
    if (key && !result[key]) {
      result[key] = entry.msg;
    }
  }
  return result;
}

function usernameIsValid(value: string): boolean {
  return USERNAME_RE.test(value);
}

function usernameFormatInvalid(value: string): boolean {
  return value.length > 0 && !usernameIsValid(value);
}

function emailIsValid(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

function emailFormatInvalid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return trimmed.length < 3 || !emailIsValid(trimmed);
}

function passwordIsValid(value: string): boolean {
  return value.length >= 8;
}

function takenFieldFromDetail(data: unknown): 'username' | 'email' | null {
  const message = errorMessage(data, '').toLowerCase();
  if (message.includes('username') && message.includes('taken')) {
    return 'username';
  }
  if (
    message.includes('email') &&
    (message.includes('already') || message.includes('exists'))
  ) {
    return 'email';
  }
  return null;
}

export function AuthForm({
  mode,
  initialError = null,
  onSwitchMode,
  autoFocusFirstField = false,
}: AuthFormProps) {
  const router = useRouter();
  const { refreshAuth } = useAuth();
  const emailId = useId();
  const usernameId = useId();
  const identifierId = useId();
  const passwordId = useId();
  const formErrorId = useId();
  const usernameHintId = useId();
  const passwordHintId = useId();
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    oauthErrorMessage(initialError),
  );
  const [pending, setPending] = useState(false);
  const [jiggling, setJiggling] = useState<Record<RevealField, boolean>>({
    username: false,
    email: false,
    password: false,
    identifier: false,
  });
  const [emailTaken, setEmailTaken] = useState(false);
  const [usernameTakenOverride, setUsernameTakenOverride] = useState(false);
  const [settledInvalid, setSettledInvalid] = useState<
    Record<RevealField, boolean>
  >({
    username: false,
    email: false,
    password: false,
    identifier: false,
  });
  const invalidTimers = useRef<Partial<Record<RevealField, number>>>({});

  const fieldRefs: Record<FieldKey, RefObject<HTMLInputElement | null>> = {
    username: usernameRef,
    email: emailRef,
    identifier: identifierRef,
    password: passwordRef,
  };

  const isSignup = mode === 'signup';
  const title = isSignup ? 'Create your account' : 'Welcome back';
  const submitLabel = isSignup ? 'Sign up' : 'Log in';
  const endpoint = isSignup ? '/api/auth/register' : '/api/auth/login';
  // Always reserve hint lines on signup so autofocus does not pop them in
  // after the first paint.
  const showUsernameHint = isSignup;
  const showPasswordHint = isSignup;
  const { status: usernameAvailability, message: availabilityMessage } =
    useUsernameAvailability(username, { enabled: isSignup });
  const usernameTaken =
    usernameTakenOverride ||
    (usernameIsValid(username) && usernameAvailability === 'taken');
  // While typing, format failures stay quiet until blur or 1s idle.
  // A submit with nothing in a required field is invalid immediately.
  const usernameInvalid =
    settledInvalid.username && !usernameIsValid(username);
  const emailInvalid = settledInvalid.email && !emailIsValid(email);
  const passwordInvalid = settledInvalid.password && !passwordIsValid(password);
  const identifierInvalid =
    settledInvalid.identifier && !identifier.trim();
  const wasInvalidRef = useRef({
    username: false,
    email: false,
    password: false,
    identifier: false,
  });

  function playJiggle(fields: RevealField[]) {
    if (fields.length === 0) {
      return;
    }
    setJiggling((prev) => {
      const next = { ...prev };
      for (const field of fields) {
        next[field] = false;
      }
      return next;
    });
    window.requestAnimationFrame(() => {
      setJiggling((prev) => {
        const next = { ...prev };
        for (const field of fields) {
          next[field] = true;
        }
        return next;
      });
    });
  }

  function stopJiggle(field: RevealField) {
    setJiggling((prev) => {
      if (!prev[field]) {
        return prev;
      }
      return { ...prev, [field]: false };
    });
  }

  function clearInvalidTimer(field: RevealField) {
    const timer = invalidTimers.current[field];
    if (timer == null) {
      return;
    }
    window.clearTimeout(timer);
    delete invalidTimers.current[field];
  }

  function markSettled(field: RevealField, invalid: boolean) {
    setSettledInvalid((prev) => {
      if (prev[field] === invalid) {
        return prev;
      }
      return { ...prev, [field]: invalid };
    });
  }

  function noteFormatChange(field: RevealField, formatInvalid: boolean) {
    if (!formatInvalid) {
      clearInvalidTimer(field);
      markSettled(field, false);
      return;
    }
    if (settledInvalid[field]) {
      return;
    }
    clearInvalidTimer(field);
    invalidTimers.current[field] = window.setTimeout(() => {
      delete invalidTimers.current[field];
      markSettled(field, true);
    }, INVALID_IDLE_MS);
  }

  function settleOnBlur(field: RevealField, formatInvalid: boolean) {
    clearInvalidTimer(field);
    markSettled(field, formatInvalid);
  }

  useEffect(() => {
    const timers = invalidTimers.current;
    return () => {
      for (const timer of Object.values(timers)) {
        if (timer != null) {
          window.clearTimeout(timer);
        }
      }
    };
  }, []);

  useEffect(() => {
    const current = {
      username: usernameInvalid,
      email: emailInvalid,
      password: passwordInvalid,
      identifier: identifierInvalid,
    };
    const started = (Object.keys(current) as RevealField[]).filter(
      (field) => current[field] && !wasInvalidRef.current[field],
    );
    wasInvalidRef.current = current;
    if (started.length > 0) {
      playJiggle(started);
    }
  }, [usernameInvalid, emailInvalid, passwordInvalid, identifierInvalid]);

  useEffect(() => {
    if (oauthErrorMessage(initialError) && formErrorRef.current) {
      formErrorRef.current.focus();
      return;
    }
    if (!autoFocusFirstField) {
      return;
    }
    const firstField = isSignup ? usernameRef.current : identifierRef.current;
    firstField?.focus();
  }, [initialError, autoFocusFirstField, isSignup]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }
    setFormError(null);
    const invalidNow: RevealField[] = [];
    if (isSignup && !usernameIsValid(username)) {
      invalidNow.push('username');
    }
    if (isSignup && !emailIsValid(email)) {
      invalidNow.push('email');
    }
    if (!isSignup && !identifier.trim()) {
      invalidNow.push('identifier');
    }
    if (!passwordIsValid(password)) {
      invalidNow.push('password');
    }
    for (const field of invalidNow) {
      settleOnBlur(field, true);
    }
    if (invalidNow.length > 0) {
      playJiggle(invalidNow);
      const first = invalidNow[0];
      if (first) {
        queueMicrotask(() => {
          fieldRefs[first].current?.focus();
        });
      }
      return;
    }
    if (isSignup && usernameAvailability === 'checking') {
      setFormError('Wait for the username check to finish.');
      return;
    }
    if (isSignup && (usernameTaken || emailTaken)) {
      return;
    }
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
        const taken = takenFieldFromDetail(data);
        if (taken === 'username') {
          setUsernameTakenOverride(true);
          return;
        }
        if (taken === 'email') {
          setEmailTaken(true);
          return;
        }
        const fromApi = fieldErrorsFromResponse(data);
        const apiInvalid: RevealField[] = [];
        if (fromApi.username) {
          apiInvalid.push('username');
        }
        if (fromApi.email) {
          apiInvalid.push('email');
        }
        if (fromApi.password) {
          apiInvalid.push('password');
        }
        if (fromApi.identifier) {
          apiInvalid.push('identifier');
        }
        if (apiInvalid.length > 0) {
          playJiggle(apiInvalid);
          const first = apiInvalid[0];
          if (first) {
            queueMicrotask(() => {
              fieldRefs[first].current?.focus();
            });
          }
          return;
        }
        setFormError(
          errorMessage(
            data,
            isSignup ? 'Could not create account' : 'Could not log in',
          ),
        );
        return;
      }
      await refreshAuth();
      router.push('/');
      router.refresh();
    } catch {
      setFormError('Network error. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="type-page text-foreground">{title}</h1>
      <p className="mt-1.5 text-sm text-muted sm:mt-2 sm:text-base">
        {isSignup
          ? 'Join to track and rediscover what you watch.'
          : 'Sign in to your library.'}
      </p>

      <form
        className="mt-6 space-y-4 sm:mt-8 sm:space-y-5"
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
                className="mb-1 block text-sm text-foreground sm:mb-1.5"
              >
                Username
              </label>
              <input
                ref={usernameRef}
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
                  const next = event.target.value;
                  setUsername(next);
                  setUsernameTakenOverride(false);
                  noteFormatChange('username', usernameFormatInvalid(next));
                }}
                onBlur={() => {
                  settleOnBlur('username', usernameFormatInvalid(username));
                }}
                onKeyDown={(event) => {
                  onFieldEnter(event, emailRef.current);
                }}
                onAnimationEnd={() => {
                  stopJiggle('username');
                }}
                aria-invalid={usernameInvalid ? true : undefined}
                aria-describedby={usernameHintId}
                className={`${INPUT_CLASS} ${usernameInvalid ? INPUT_INVALID_CLASS : ''} ${jiggling.username ? 'is-jiggling' : ''}`}
              />
              <p
                id={usernameHintId}
                role={usernameInvalid || usernameTaken ? 'alert' : undefined}
                className={`mt-1.5 text-sm ${
                  usernameInvalid || usernameTaken
                    ? 'text-[var(--color-danger)]'
                    : usernameAvailability === 'available'
                      ? 'text-foreground'
                      : 'text-muted'
                }`}
              >
                {usernameTaken
                  ? USERNAME_TAKEN
                  : usernameAvailability === 'available' &&
                      usernameIsValid(username)
                    ? (availabilityMessage ?? USERNAME_HINT)
                    : usernameAvailability === 'checking' &&
                        usernameIsValid(username)
                      ? (availabilityMessage ?? USERNAME_HINT)
                      : usernameAvailability === 'error' &&
                          usernameIsValid(username)
                        ? (availabilityMessage ?? USERNAME_HINT)
                        : USERNAME_HINT}
              </p>
            </div>
            <div>
              <label
                htmlFor={emailId}
                className="mb-1 block text-sm text-foreground sm:mb-1.5"
              >
                Email
              </label>
              <input
                ref={emailRef}
                id={emailId}
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => {
                  const next = event.target.value;
                  setEmail(next);
                  setEmailTaken(false);
                  noteFormatChange('email', emailFormatInvalid(next));
                }}
                onBlur={() => {
                  settleOnBlur('email', emailFormatInvalid(email));
                }}
                onKeyDown={(event) => {
                  onFieldEnter(event, passwordRef.current);
                }}
                onAnimationEnd={() => {
                  stopJiggle('email');
                }}
                aria-invalid={emailInvalid ? true : undefined}
                aria-describedby={`${emailId}-hint`}
                className={`${INPUT_CLASS} ${emailInvalid ? INPUT_INVALID_CLASS : ''} ${jiggling.email ? 'is-jiggling' : ''}`}
              />
              <p
                id={`${emailId}-hint`}
                role={emailInvalid || emailTaken ? 'alert' : undefined}
                className={`mt-1.5 text-sm ${
                  emailInvalid || emailTaken
                    ? 'text-[var(--color-danger)]'
                    : 'text-muted'
                }`}
              >
                {emailTaken ? EMAIL_TAKEN : EMAIL_HINT}
              </p>
            </div>
          </>
        ) : (
          <div>
            <label
              htmlFor={identifierId}
              className="mb-1 block text-sm text-foreground sm:mb-1.5"
            >
              Email or username
            </label>
            <input
              ref={identifierRef}
              id={identifierId}
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => {
                const next = event.target.value;
                setIdentifier(next);
                noteFormatChange('identifier', next.length > 0 && !next.trim());
              }}
              onBlur={() => {
                settleOnBlur(
                  'identifier',
                  identifier.length > 0 && !identifier.trim(),
                );
              }}
              onKeyDown={(event) => {
                onFieldEnter(event, passwordRef.current);
              }}
              onAnimationEnd={() => {
                stopJiggle('identifier');
              }}
              aria-invalid={identifierInvalid ? true : undefined}
              aria-describedby={
                identifierInvalid ? `${identifierId}-error` : undefined
              }
              className={`${INPUT_CLASS} ${identifierInvalid ? INPUT_INVALID_CLASS : ''} ${jiggling.identifier ? 'is-jiggling' : ''}`}
            />
            {identifierInvalid ? (
              <p
                id={`${identifierId}-error`}
                role="alert"
                className="mt-1.5 text-sm text-[var(--color-danger)]"
              >
                Enter your email or username.
              </p>
            ) : null}
          </div>
        )}

        <div>
          <label
            htmlFor={passwordId}
            className="mb-1 block text-sm text-foreground sm:mb-1.5"
          >
            Password
          </label>
          <div
            className={`relative ${jiggling.password ? 'is-jiggling' : ''}`}
            onAnimationEnd={() => {
              stopJiggle('password');
            }}
          >
            <input
              ref={passwordRef}
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(event) => {
                const next = event.target.value;
                setPassword(next);
                noteFormatChange(
                  'password',
                  next.length > 0 && !passwordIsValid(next),
                );
              }}
              onBlur={() => {
                settleOnBlur(
                  'password',
                  password.length > 0 && !passwordIsValid(password),
                );
              }}
              onKeyDown={(event) => {
                onFieldEnter(event, null);
              }}
              aria-invalid={passwordInvalid ? true : undefined}
              aria-describedby={
                showPasswordHint || passwordInvalid ? passwordHintId : undefined
              }
              className={`${INPUT_CLASS} pr-16 ${passwordInvalid ? INPUT_INVALID_CLASS : ''}`}
            />
            <button
              type="button"
              onClick={() => {
                setShowPassword((prev) => !prev);
              }}
              aria-pressed={showPassword}
              aria-controls={passwordId}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 px-3 text-sm text-muted transition hover:text-foreground"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {showPasswordHint || passwordInvalid ? (
            <p
              id={passwordHintId}
              role={passwordInvalid ? 'alert' : undefined}
              className={`mt-1.5 text-sm ${
                passwordInvalid ? 'text-[var(--color-danger)]' : 'text-muted'
              }`}
            >
              {PASSWORD_HINT}
            </p>
          ) : null}
        </div>

        {formError ? (
          <p
            ref={formErrorRef}
            id={formErrorId}
            role="alert"
            tabIndex={-1}
            className="text-sm text-[var(--color-danger)] outline-none"
          >
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label={pending ? 'Please wait' : undefined}
          className={`btn btn-solid btn-block relative ${pending ? 'is-pending' : ''}`}
        >
          <span className={pending ? 'invisible' : undefined}>
            {submitLabel}
          </span>
          {pending ? <span className="btn-spinner" aria-hidden /> : null}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs tracking-wide text-muted uppercase">or</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <div className="mt-5">
        {/*
          Same Google path for login and signup (intent=sign_in): API creates a
          Google-only account or logs in an existing one. `return` only picks
          which guest page shows OAuth errors.
        */}
        <a
          href={`/api/auth/google/start?intent=sign_in&return=${isSignup ? 'signup' : 'login'}`}
          className="btn btn-google btn-lg btn-block gap-3"
        >
          <GoogleMark className="shrink-0" />
          Continue with Google
        </a>
      </div>

      <p className="mt-5 text-sm text-muted sm:mt-6">
        {isSignup ? (
          <>
            Already have an account?{' '}
            {onSwitchMode ? (
              <button
                type="button"
                onClick={() => {
                  onSwitchMode('login');
                }}
                className="text-foreground underline underline-offset-2"
              >
                Log in
              </button>
            ) : (
              <Link
                href="/login"
                className="text-foreground underline underline-offset-2"
              >
                Log in
              </Link>
            )}
          </>
        ) : (
          <>
            Need an account?{' '}
            {onSwitchMode ? (
              <button
                type="button"
                onClick={() => {
                  onSwitchMode('signup');
                }}
                className="text-foreground underline underline-offset-2"
              >
                Sign up
              </button>
            ) : (
              <Link
                href="/signup"
                className="text-foreground underline underline-offset-2"
              >
                Sign up
              </Link>
            )}
          </>
        )}
      </p>
    </div>
  );
}
