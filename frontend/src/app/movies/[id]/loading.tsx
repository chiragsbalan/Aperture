import { CatalogLoading } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function MovieLoading() {
  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <CatalogLoading />
    </main>
  );
}
