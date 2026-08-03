import {
  CatalogUnavailable,
  PersonDetailView,
} from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';
import { fetchPerson } from '@/lib/catalog';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface PersonPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PersonPageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await fetchPerson(id);
  if (!result.ok) {
    return { title: 'Person · Aperture' };
  }
  return {
    title: `${result.data.name} · Aperture`,
    description:
      result.data.biography?.slice(0, 160) ||
      `${result.data.name} on Aperture.`,
  };
}

export default async function PersonPage({ params }: PersonPageProps) {
  const { id } = await params;
  const result = await fetchPerson(id);

  if (!result.ok && result.status === 404) {
    notFound();
  }

  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1]">
        {!result.ok ? (
          <CatalogUnavailable message={result.error} />
        ) : (
          <PersonDetailView person={result.data} />
        )}
      </main>
    </div>
  );
}
