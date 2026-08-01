/** Apply persisted theme preference to the document root. */

export type ThemePreference = 'system' | 'light' | 'dark';

export function applyThemePreference(theme: ThemePreference): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    return;
  }
  root.setAttribute('data-theme', theme);
}
