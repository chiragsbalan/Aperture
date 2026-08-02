import { AccountPanel } from '@/components/account-panel';
import { SiteHeader } from '@/components/site-header';
import { Suspense } from 'react';

export default function AccountPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center px-6 py-24">
      <SiteHeader />
      <div className="motion-fade-rise w-full max-w-lg">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Profile
        </h1>
        <p className="mt-2 text-muted">
          Your library, account details, and settings.
        </p>
        <Suspense
          fallback={
            <p className="mt-8 text-muted" role="status">
              Loading account…
            </p>
          }
        >
          <AccountPanel />
        </Suspense>
      </div>
    </main>
  );
}
