import { GuestAuthRoute } from '@/components/guest-auth-route';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return <GuestAuthRoute mode="login" initialError={params.error ?? null} />;
}
