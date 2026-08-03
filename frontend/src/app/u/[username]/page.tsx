import { PublicProfileView } from '@/components/public-profile';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

interface PublicProfilePageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: PublicProfilePageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} · Aperture`,
    description: `Public profile for @${username} on Aperture.`,
  };
}

export default async function PublicProfilePage({
  params,
}: PublicProfilePageProps) {
  const { username } = await params;

  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center py-24">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main
        id="main-content"
        className="layout-content motion-fade-rise relative z-[1]"
      >
        <PublicProfileView username={username} />
      </main>
    </div>
  );
}
