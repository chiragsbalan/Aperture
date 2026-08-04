import { PublicWatchlistPage } from '@/components/public-watchlist-page';
import type { Metadata } from 'next';

interface ProfileWatchlistTabPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: ProfileWatchlistTabPageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Watchlist · @${username} · Aperture`,
    description: `Public watchlist for @${username} on Aperture.`,
  };
}

export default async function ProfileWatchlistTabPage({
  params,
}: ProfileWatchlistTabPageProps) {
  const { username } = await params;
  return <PublicWatchlistPage username={username} />;
}
