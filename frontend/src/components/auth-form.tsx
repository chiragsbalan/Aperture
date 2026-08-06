'use client';

import { oauthErrorMessage } from '@/lib/google-oauth-errors';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
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

const FIELD_FOCUS_ORDER: FieldKey[] = [
  'username',
  'email',
  'identifier',
  'password',
];

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

function clientFieldErrors(
  mode: 'login' | 'signup',
  values: {
    username: string;
    email: string;
    identifier: string;
    password: string;
  },
): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'signup') {
    if (!/^[A-Za-z0-9_]{3,32}$/.test(values.username)) {
      errors.username = 'Use 3–32 letters, digits, or underscore.';
    }
    if (!values.email.trim() || !values.email.includes('@')) {
      errors.email = 'Enter a valid email.';
    }
  } else if (!values.identifier.trim()) {
    errors.identifier = 'Enter your email or username.';
  }
  if (values.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  return errors;
}

function focusFirstInvalidField(
  errors: FieldErrors,
  refs: Record<FieldKey, RefObject<HTMLInputElement | null>>,
) {
  for (const key of FIELD_FOCUS_ORDER) {
    if (errors[key]) {
      refs[key].current?.focus();
      return;
    }
  }
}

export function AuthForm({
  mode,
  initialError = null,
  onSwitchMode,
  autoFocusFirstField = false,
}: AuthFormProps) {
  const router = useRouter();
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
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(
    oauthErrorMessage(initialError),
  );
  const [pending, setPending] = useState(false);

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
  const showUsernameHint =
    isSignup && (usernameFocused || Boolean(fieldErrors.username));
  const showPasswordHint =
    isSignup && (passwordFocused || Boolean(fieldErrors.password));

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
    setFormError(null);
    const localErrors = clientFieldErrors(mode, {
      username,
      email,
      identifier,
      password,
    });
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      // Focus after state flush so aria-invalid is present for AT.
      queueMicrotask(() => {
        focusFirstInvalidField(localErrors, fieldRefs);
      });
      return;
    }
    setFieldErrors({});
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
        const fromApi = fieldErrorsFromResponse(data);
        if (Object.keys(fromApi).length > 0) {
          setFieldErrors(fromApi);
          setFormError(null);
          queueMicrotask(() => {
            focusFirstInvalidField(fromApi, fieldRefs);
          });
        } else {
          setFieldErrors({});
          setFormError(
            errorMessage(
              data,
              isSignup ? 'Could not create account' : 'Could not log in',
            ),
          );
        }
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setFormError('Network error — try again');
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
                  setUsername(event.target.value);
                  if (fieldErrors.username) {
                    setFieldErrors((prev) => ({
                      ...prev,
                      username: undefined,
                    }));
                  }
                }}
                onFocus={() => {
                  setUsernameFocused(true);
                }}
                onBlur={() => {
                  setUsernameFocused(false);
                }}
                aria-invalid={fieldErrors.username ? true : undefined}
                aria-describedby={
                  showUsernameHint || fieldErrors.username
                    ? usernameHintId
                    : undefined
                }
                className={INPUT_CLASS}
              />
              {showUsernameHint ? (
                <p
                  id={usernameHintId}
                  role={fieldErrors.username ? 'alert' : undefined}
                  className={`mt-1.5 text-sm ${
                    fieldErrors.username
                      ? 'text-[var(--color-danger)]'
                      : 'text-muted'
                  }`}
                >
                  {fieldErrors.username ??
                    '3–32 characters: letters, digits, underscore.'}
                </p>
              ) : null}
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
                  setEmail(event.target.value);
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={
                  fieldErrors.email ? `${emailId}-error` : undefined
                }
                className={INPUT_CLASS}
              />
              {fieldErrors.email ? (
                <p
                  id={`${emailId}-error`}
                  role="alert"
                  className="mt-1.5 text-sm text-[var(--color-danger)]"
                >
                  {fieldErrors.email}
                </p>
              ) : null}
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
                setIdentifier(event.target.value);
                if (fieldErrors.identifier) {
                  setFieldErrors((prev) => ({
                    ...prev,
                    identifier: undefined,
                  }));
                }
              }}
              aria-invalid={fieldErrors.identifier ? true : undefined}
              aria-describedby={
                fieldErrors.identifier ? `${identifierId}-error` : undefined
              }
              className={INPUT_CLASS}
            />
            {fieldErrors.identifier ? (
              <p
                id={`${identifierId}-error`}
                role="alert"
                className="mt-1.5 text-sm text-[var(--color-danger)]"
              >
                {fieldErrors.identifier}
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
          <div className="relative">
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
                setPassword(event.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }
              }}
              onFocus={() => {
                setPasswordFocused(true);
              }}
              onBlur={() => {
                setPasswordFocused(false);
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                showPasswordHint || fieldErrors.password
                  ? passwordHintId
                  : undefined
              }
              className={`${INPUT_CLASS} pr-16`}
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
          {showPasswordHint || fieldErrors.password ? (
            <p
              id={passwordHintId}
              role={fieldErrors.password ? 'alert' : undefined}
              className={`mt-1.5 text-sm ${
                fieldErrors.password
                  ? 'text-[var(--color-danger)]'
                  : 'text-muted'
              }`}
            >
              {fieldErrors.password ?? 'At least 8 characters.'}
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
          className="btn btn-solid btn-block"
        >
          {pending ? 'Please wait…' : submitLabel}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-xs tracking-wide text-muted uppercase">or</span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <div className="mt-5">
        <a
          href="/api/auth/google/start?intent=sign_in"
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
