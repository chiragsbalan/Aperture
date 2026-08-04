import { ProfileLists } from '@/components/profile-lists';

interface ProfileListsPageProps {
  params: Promise<{ username: string }>;
}

export default async function ProfileListsPage({
  params,
}: ProfileListsPageProps) {
  const { username } = await params;
  return <ProfileLists username={username} />;
}
