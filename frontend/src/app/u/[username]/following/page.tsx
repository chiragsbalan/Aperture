import { redirect } from 'next/navigation';

interface ProfileFollowingPageProps {
  params: Promise<{ username: string }>;
}

/** Deep link → profile with Following sheet open (no full-page leave). */
export default async function ProfileFollowingPage({
  params,
}: ProfileFollowingPageProps) {
  const { username } = await params;
  redirect(
    `/u/${encodeURIComponent(username)}?people=${encodeURIComponent('following')}`,
  );
}
