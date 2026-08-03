'use client';

import {
  apiErrorMessage,
  type OwnedProfile,
  type Preferences,
} from '@/lib/profile';
import { applyThemePreference } from '@/lib/theme';
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: OwnedProfile };

export function SettingsForm() {
  const usernameId = useId();
  const usernameHintId = useId();
  const displayNameId = useId();
  const bioId = useId();
  const themeId = useId();
  const spoilersId = useId();
  const languageId = useId();
  const languageHintId = useId();
  const errorId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'system',
    spoilers: 'show',
    language: 'en',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [renameAvailableAt, setRenameAvailableAt] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/proxy/api/v1/users/me', {
          cache: 'no-store',
        });
        if (cancelled) {
          return;
        }
        if (res.status === 401) {
          setState({
            status: 'error',
            message: 'You are not signed in.',
          });
          return;
        }
        if (!res.ok) {
          setState({
            status: 'error',
            message: `Could not load settings (HTTP ${res.status}).`,
          });
          return;
        }
        const profile = (await res.json()) as OwnedProfile;
        setState({ status: 'ok', profile });
        setUsername(profile.username);
        setDisplayName(profile.display_name ?? '');
        setBio(profile.bio ?? '');
        setPreferences(profile.preferences);
        setRenameAvailableAt(profile.username_rename_available_at);
        applyThemePreference(profile.preferences.theme);
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Failed to reach the API.',
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ok') {
      return;
    }
    setError(null);
    setSuccess(null);
    setPending(true);

    const profileBody: Record<string, unknown> = {
      display_name: displayName.trim() ? displayName.trim() : null,
      bio: bio.trim() ? bio.trim() : null,
      preferences,
    };
    if (username.trim().toLowerCase() !== state.profile.username) {
      profileBody.username = username.trim().toLowerCase();
    }

    try {
      const profileRes = await fetch('/api/proxy/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profileBody),
      });
      const profileData: unknown = await profileRes.json().catch(() => null);
      if (!profileRes.ok) {
        setError(apiErrorMessage(profileData, 'Could not save settings'));
        return;
      }

      const updated = profileData as OwnedProfile;
      setState({ status: 'ok', profile: updated });
      setUsername(updated.username);
      setDisplayName(updated.display_name ?? '');
      setBio(updated.bio ?? '');
      setPreferences(updated.preferences);
      setRenameAvailableAt(updated.username_rename_available_at);
      applyThemePreference(updated.preferences.theme);
      setSuccess('Settings saved.');
    } catch {
      setError('Network error — try again');
    } finally {
      setPending(false);
      queueMicrotask(() => {
        submitRef.current?.focus();
      });
    }
  }

  if (state.status === 'loading') {
    return (
      <p className="mt-8 text-muted" role="status">
        Loading settings…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="mt-8 space-y-4">
        <p role="alert" className="text-[var(--color-danger)]">
          {state.message}
        </p>
        <p className="text-sm text-muted">
          <Link
            href="/login"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    );
  }

  const renameLocked =
    renameAvailableAt !== null &&
    new Date(renameAvailableAt).getTime() > Date.now();
  const usernameDescribedBy = error
    ? `${usernameHintId} ${errorId}`
    : usernameHintId;

  return (
    <form
      className="mt-8 space-y-6 text-left"
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
    >
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-[var(--color-danger)]"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-foreground">
          {success}
        </p>
      ) : null}

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="type-subsection text-foreground">
          Profile
        </legend>

        <div>
          <label htmlFor={usernameId} className="text-sm text-muted">
            Username
          </label>
          <input
            id={usernameId}
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
            readOnly={renameLocked}
            aria-invalid={error ? true : undefined}
            aria-describedby={usernameDescribedBy}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground read-only:opacity-70"
          />
          <p id={usernameHintId} className="mt-1 text-xs text-muted">
            {renameLocked
              ? `Username can change again after ${new Date(renameAvailableAt!).toLocaleString()}.`
              : '3–32 characters: a–z, 0–9, underscore. Once every 30 days.'}
          </p>
        </div>

        <div>
          <label htmlFor={displayNameId} className="text-sm text-muted">
            Display name
          </label>
          <input
            id={displayNameId}
            name="display_name"
            autoComplete="nickname"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
            maxLength={120}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
          />
        </div>

        <div>
          <label htmlFor={bioId} className="text-sm text-muted">
            Bio
          </label>
          <textarea
            id={bioId}
            name="bio"
            value={bio}
            onChange={(event) => {
              setBio(event.target.value);
            }}
            maxLength={500}
            rows={4}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="type-subsection text-foreground">
          Preferences
        </legend>

        <div>
          <label htmlFor={themeId} className="text-sm text-muted">
            Theme
          </label>
          <select
            id={themeId}
            name="theme"
            value={preferences.theme}
            onChange={(event) => {
              const theme = event.target.value as Preferences['theme'];
              setPreferences((prev) => ({ ...prev, theme }));
              applyThemePreference(theme);
            }}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <div>
          <label htmlFor={spoilersId} className="text-sm text-muted">
            Spoilers
          </label>
          <select
            id={spoilersId}
            name="spoilers"
            value={preferences.spoilers}
            onChange={(event) => {
              setPreferences((prev) => ({
                ...prev,
                spoilers: event.target.value as Preferences['spoilers'],
              }));
            }}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
          >
            <option value="show">Show spoilers</option>
            <option value="hide">Hide spoilers</option>
          </select>
        </div>

        <div>
          <label htmlFor={languageId} className="text-sm text-muted">
            Language
          </label>
          <input
            id={languageId}
            name="language"
            value={preferences.language}
            onChange={(event) => {
              setPreferences((prev) => ({
                ...prev,
                language: event.target.value,
              }));
            }}
            maxLength={16}
            aria-describedby={languageHintId}
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
          />
          <p id={languageHintId} className="mt-1 text-xs text-muted">
            Locale stub (e.g. en). Full i18n comes later.
          </p>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <button
          ref={submitRef}
          type="submit"
          className="rounded-[var(--radius-sm)] border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-4 py-2 text-foreground transition hover:border-[var(--color-accent)] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save settings'}
        </button>
        <Link
          href="/account"
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          Back to account
        </Link>
      </div>
    </form>
  );
}
