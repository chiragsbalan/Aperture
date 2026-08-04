import { SettingsForm } from '@/components/settings-form';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings · Aperture',
  description: 'Edit your Aperture profile and preferences.',
};

export default function SettingsPage() {
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content motion-fade-rise relative z-[1]"
      >
        <h1 className="type-page-lg text-foreground">Settings</h1>
        <p className="mt-2 text-muted">Edit your profile and preferences.</p>
        <SettingsForm />
      </main>
    </div>
  );
}
