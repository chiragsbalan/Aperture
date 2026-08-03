import { ProfileDiary } from '@/components/profile-diary';

interface ProfileDiaryPageProps {
  params: Promise<{ username: string }>;
}

export default async function ProfileDiaryPage({
  params,
}: ProfileDiaryPageProps) {
  const { username } = await params;
  return <ProfileDiary username={username} />;
}
