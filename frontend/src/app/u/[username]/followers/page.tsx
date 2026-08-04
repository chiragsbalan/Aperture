import { redirect } from 'next/navigation';

interface ProfileFollowersPageProps {
  params: Promise<{ username: string }>;
}

/** Deep link → profile with Followers sheet open (no full-page leave). */
export default async function ProfileFollowersPage({
  params,
}: ProfileFollowersPageProps) {
  const { username } = await params;
  redirect(
    `/u/${encodeURIComponent(username)}?people=${encodeURIComponent('followers')}`,
  );
}
