import { CatalogLoading } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function TvLoading() {
  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <CatalogLoading />
    </main>
  );
}
