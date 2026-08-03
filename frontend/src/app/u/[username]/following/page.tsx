import { ProfileCollectionPage } from '@/components/profile-collection-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

interface ProfileFollowingPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: ProfileFollowingPageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Following · @${username} · Aperture`,
    description: `People @${username} follows on Aperture.`,
  };
}

export default async function ProfileFollowingPage({
  params,
}: ProfileFollowingPageProps) {
  const { username } = await params;
  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col items-center py-16 sm:py-24">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <ProfileCollectionPage username={username} collection="following" />
      </main>
    </div>
  );
}
