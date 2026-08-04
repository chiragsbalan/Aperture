import { ProfileCollectionPage } from '@/components/profile-collection-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

interface ProfileMoviesPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: ProfileMoviesPageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Movies · @${username} · Aperture`,
    description: `Movies logged by @${username} on Aperture.`,
  };
}

export default async function ProfileMoviesPage({
  params,
}: ProfileMoviesPageProps) {
  const { username } = await params;
  return (
    <div className="layout-shell shell-atmosphere relative flex min-h-dvh flex-col items-center">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <ProfileCollectionPage username={username} collection="movies" />
      </main>
    </div>
  );
}
