import { GuestAuthRoute } from '@/components/guest-auth-route';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return <GuestAuthRoute mode="signup" initialError={params.error ?? null} />;
}
