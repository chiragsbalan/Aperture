import { CatalogLoading } from '@/components/catalog-detail';
import { SiteHeader } from '@/components/site-header';

export default function TvLoading() {
  return (
    <div className="shell-atmosphere relative min-h-dvh overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1]">
        <CatalogLoading />
      </main>
    </div>
  );
}
