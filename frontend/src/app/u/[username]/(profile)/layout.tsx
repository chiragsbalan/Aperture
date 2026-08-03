import { PublicProfileView } from '@/components/public-profile';
import { SiteHeader } from '@/components/site-header';
import type { ReactNode } from 'react';

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
    <div className="shell-atmosphere relative flex min-h-dvh flex-col py-16 sm:py-24">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content motion-fade-rise relative z-[1] w-full"
      >
        <PublicProfileView username={username}>{children}</PublicProfileView>
      </main>
    </div>
  );
}
