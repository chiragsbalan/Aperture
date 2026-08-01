import { SettingsForm } from '@/components/settings-form';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Settings · Aperture',
  description: 'Edit your Aperture profile and preferences.',
};

export default function SettingsPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center px-6 py-24">
      <SiteHeader />
      <div className="motion-fade-rise w-full max-w-lg">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-2 text-muted">
          Edit your profile and preferences.
        </p>
        <SettingsForm />
      </div>
    </main>
  );
}
