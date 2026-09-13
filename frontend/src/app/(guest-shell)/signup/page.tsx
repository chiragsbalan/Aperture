import { AuthForm } from '@/components/auth-form';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="motion-fade-rise w-full max-w-md">
      <AuthForm mode="signup" initialError={params.error ?? null} />
    </div>
  );
}
