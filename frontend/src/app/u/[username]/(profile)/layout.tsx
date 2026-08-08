import { PublicProfileView } from '@/components/public-profile';
import { ProfileHeaderSkeleton } from '@/components/skeleton';
import { SiteHeader } from '@/components/site-header';
import { Suspense, type ReactNode } from 'react';

interface ProfileShellLayoutProps {
  children: ReactNode;
  params: Promise<{ username: string }>;
}

export default async function ProfileShellLayout({
  children,
  params,
}: ProfileShellLayoutProps) {
  const { username } = await params;

  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content motion-fade-rise relative z-[1] w-full"
      >
        <Suspense fallback={<ProfileHeaderSkeleton />}>
          <PublicProfileView username={username}>{children}</PublicProfileView>
        </Suspense>
      </main>
    </div>
  );
}
