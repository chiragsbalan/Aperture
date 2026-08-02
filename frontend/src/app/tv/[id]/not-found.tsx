import {
  CatalogNotFound,
  CatalogStatusShell,
} from '@/components/catalog-detail';

export default function TvNotFound() {
  return (
    <CatalogStatusShell>
      <CatalogNotFound label="TV show" />
    </CatalogStatusShell>
  );
}
