import { AccountPanel } from '@/components/account-panel';
import { FormSkeleton } from '@/components/skeleton';
import { SiteHeader } from '@/components/site-header';
import { Suspense } from 'react';

export default function AccountPage() {
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
        <h1 className="type-page-lg text-foreground">Profile</h1>
        <p className="mt-2 text-muted">
          Your library, account details, and settings.
        </p>
        <Suspense fallback={<FormSkeleton rows={3} />}>
          <AccountPanel />
        </Suspense>
      </main>
    </div>
  );
}
