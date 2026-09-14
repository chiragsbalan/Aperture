import { ProfileReviews } from '@/components/profile-reviews';
import type { Metadata } from 'next';

interface ProfileReviewsPageProps {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: ProfileReviewsPageProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `Reviews · @${username} · Aperture`,
    description: `Public reviews by @${username} on Aperture.`,
  };
}

export default async function ProfileReviewsPage({
  params,
}: ProfileReviewsPageProps) {
  const { username } = await params;
  return <ProfileReviews username={username} />;
}
