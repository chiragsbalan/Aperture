import { CatalogNotFound } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function MovieNotFound() {
  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <CatalogNotFound label="Movie" />
    </main>
  );
}
