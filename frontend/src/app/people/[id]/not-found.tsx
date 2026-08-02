import { CatalogNotFound } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function PersonNotFound() {
  return (
    <main className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <SiteHeader />
      <CatalogNotFound label="Person" />
    </main>
  );
}
