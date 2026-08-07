'use client';

import {
  apiErrorMessage,
  type OwnedProfile,
  type Preferences,
  type ProfileLink,
} from '@/lib/profile';
import {
  AvatarUploadError,
  avatarFileAccept,
  deleteAvatar,
  uploadAvatarFile,
} from '@/lib/avatar-upload';
import { useAuth } from '@/components/auth-provider';
import { ProfileAvatar } from '@/components/profile-avatar';
import { FormSkeleton } from '@/components/skeleton';
import { invalidatePublicWatchEntries } from '@/lib/library';
import { applyThemePreference } from '@/lib/theme';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; profile: OwnedProfile };

const MAX_LINKS = 3;

export function SettingsForm() {
  const router = useRouter();
  const { clearAuth, refreshAuth } = useAuth();
  const usernameId = useId();
  const usernameHintId = useId();
  const displayNameId = useId();
  const bioId = useId();
  const avatarId = useId();
  const websiteId = useId();
  const themeId = useId();
  const spoilersId = useId();
  const languageId = useId();
  const languageHintId = useId();
  const errorId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'system',
    spoilers: 'show',
    language: 'en',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [renameAvailableAt, setRenameAvailableAt] = useState<string | null>(
    null,
  );

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) {
        setLogoutError(`Could not log out (HTTP ${res.status}).`);
        return;
      }
      clearAuth();
      invalidatePublicWatchEntries();
      router.push('/');
      router.refresh();
    } catch {
      setLogoutError('Could not log out. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  }

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
        setAvatarUrl(profile.avatar_url);
        setWebsiteUrl(profile.website_url ?? '');
        setLinks(profile.links ?? []);
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

  function applyProfile(updated: OwnedProfile) {
    setState({ status: 'ok', profile: updated });
    setUsername(updated.username);
    setDisplayName(updated.display_name ?? '');
    setBio(updated.bio ?? '');
    setAvatarUrl(updated.avatar_url);
    setWebsiteUrl(updated.website_url ?? '');
    setLinks(updated.links ?? []);
    setPreferences(updated.preferences);
    setRenameAvailableAt(updated.username_rename_available_at);
    applyThemePreference(updated.preferences.theme);
  }

  async function onAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || state.status !== 'ok') {
      return;
    }
    setAvatarError(null);
    setSuccess(null);
    setAvatarPending(true);
    try {
      const updated = await uploadAvatarFile(file);
      applyProfile(updated);
      await refreshAuth();
      setSuccess('Profile photo updated.');
    } catch (err) {
      // Only surface AvatarUploadError text — other exceptions stay generic
      // (avoids leaking unexpected Error.message into the UI).
      const message =
        err instanceof AvatarUploadError
          ? err.message
          : 'Could not upload photo.';
      setAvatarError(message);
    } finally {
      setAvatarPending(false);
    }
  }

  async function onAvatarRemove() {
    if (state.status !== 'ok' || !avatarUrl) {
      return;
    }
    setAvatarError(null);
    setSuccess(null);
    setAvatarPending(true);
    try {
      const updated = await deleteAvatar();
      applyProfile(updated);
      await refreshAuth();
      setSuccess('Profile photo removed.');
    } catch (err) {
      const message =
        err instanceof AvatarUploadError
          ? err.message
          : 'Could not remove photo.';
      setAvatarError(message);
    } finally {
      setAvatarPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ok') {
      return;
    }
    setError(null);
    setSuccess(null);
    setPending(true);

    const cleanedLinks = links
      .map((link) => ({
        label: link.label.trim(),
        url: link.url.trim(),
      }))
      .filter((link) => link.label && link.url)
      .slice(0, MAX_LINKS);

    const profileBody: Record<string, unknown> = {
      display_name: displayName.trim() ? displayName.trim() : null,
      bio: bio.trim() ? bio.trim() : null,
      website_url: websiteUrl.trim() ? websiteUrl.trim() : null,
      links: cleanedLinks,
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

      applyProfile(profileData as OwnedProfile);
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
    return <FormSkeleton />;
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
    <>
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
          <legend className="type-subsection text-foreground">Profile</legend>

          <div>
            <p className="text-sm text-muted" id={`${avatarId}-label`}>
              Profile photo
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4">
              <ProfileAvatar
                username={username || state.profile.username}
                displayName={displayName}
                avatarUrl={avatarUrl}
                size="lg"
              />
              <div className="space-y-2">
                <input
                  ref={avatarInputRef}
                  id={avatarId}
                  name="avatar"
                  type="file"
                  accept={avatarFileAccept()}
                  className="sr-only"
                  aria-labelledby={`${avatarId}-label`}
                  disabled={avatarPending || pending}
                  onChange={onAvatarChange}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
                    disabled={avatarPending || pending}
                    onClick={() => {
                      avatarInputRef.current?.click();
                    }}
                  >
                    {avatarPending ? 'Uploading…' : 'Upload photo'}
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-muted disabled:opacity-60"
                      disabled={avatarPending || pending}
                      onClick={() => {
                        void onAvatarRemove();
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-muted">
                  JPEG, PNG, or WebP up to 2MB.
                </p>
                {avatarError ? (
                  <p
                    role="alert"
                    className="text-xs text-[var(--color-danger)]"
                  >
                    {avatarError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

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

          <div>
            <label htmlFor={websiteId} className="text-sm text-muted">
              Website
            </label>
            <input
              id={websiteId}
              name="website_url"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={websiteUrl}
              onChange={(event) => {
                setWebsiteUrl(event.target.value);
              }}
              maxLength={512}
              className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted">Links (up to {MAX_LINKS})</p>
            {links.map((link, index) => (
              <div
                key={`link-${index}`}
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
              >
                <input
                  aria-label={`Link ${index + 1} label`}
                  value={link.label}
                  onChange={(event) => {
                    const next = [...links];
                    next[index] = { ...link, label: event.target.value };
                    setLinks(next);
                  }}
                  placeholder="Label"
                  maxLength={40}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
                />
                <input
                  aria-label={`Link ${index + 1} URL`}
                  type="url"
                  value={link.url}
                  onChange={(event) => {
                    const next = [...links];
                    next[index] = { ...link, url: event.target.value };
                    setLinks(next);
                  }}
                  placeholder="https://"
                  maxLength={512}
                  className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-transparent px-3 py-2 text-foreground"
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setLinks(links.filter((_, i) => i !== index));
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
            {links.length < MAX_LINKS ? (
              <button
                type="button"
                className="btn btn-ghost underline-offset-2 hover:underline"
                onClick={() => {
                  setLinks([...links, { label: '', url: '' }]);
                }}
              >
                Add link
              </button>
            ) : null}
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
          <button ref={submitRef} type="submit" className="btn btn-primary">
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

      <div className="mt-10 border-t border-[var(--color-border)] pt-8">
        {logoutError ? (
          <p role="alert" className="mb-4 text-sm text-[var(--color-danger)]">
            {logoutError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          disabled={loggingOut}
          className="btn btn-lg hover:border-[var(--color-accent)]"
        >
          {loggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </div>
    </>
  );
}
