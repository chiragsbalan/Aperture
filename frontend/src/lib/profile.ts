/** Profile helpers shared by account / settings / public pages. */

export interface Preferences {
  theme: 'system' | 'light' | 'dark';
  spoilers: 'show' | 'hide';
  language: string;
}

export interface OwnedProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  preferences: Preferences;
  username_changed_at: string | null;
  username_rename_available_at: string | null;
}

export interface PublicProfile {
  username: string;
  display_name: string | null;
  bio: string | null;
}

export function initialsFromProfile(
  displayName: string | null | undefined,
  username: string,
): string {
  const source = (displayName ?? '').trim() || username;
  const parts = source.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      return (detail as { message: string }).message;
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
