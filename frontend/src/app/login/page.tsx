import { AuthForm } from '@/components/auth-form';
import { SiteHeader } from '@/components/site-header';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center px-6 py-24">
      <SiteHeader />
      <div className="motion-fade-rise">
        <AuthForm mode="login" initialError={params.error ?? null} />
      </div>
    </main>
  );
}
