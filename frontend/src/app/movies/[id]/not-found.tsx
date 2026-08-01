import { CatalogNotFound } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function MovieNotFound() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <CatalogNotFound label="Movie" />
    </main>
  );
}
