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
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center px-6 py-24">
      <SiteHeader />
      <div className="motion-fade-rise w-full max-w-lg">
        <PublicProfileView username={username} />
      </div>
    </main>
  );
}
