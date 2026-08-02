import { AuthForm } from '@/components/auth-form';
import { PosterMosaic } from '@/components/poster-mosaic';
import { SiteHeader } from '@/components/site-header';
import { fetchLandingPosterUrls } from '@/lib/catalog';

export default async function SignupPage() {
  const posters = await fetchLandingPosterUrls();

  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-24">
      <PosterMosaic posters={posters} />
      <SiteHeader />
      <div className="relative z-[1] motion-fade-rise">
        <AuthForm mode="signup" />
      </div>
    </main>
  );
}
