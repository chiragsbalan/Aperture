import {
  CatalogNotFound,
  CatalogStatusShell,
} from '@/components/catalog-detail';

export default function MovieNotFound() {
  return (
    <CatalogStatusShell>
      <CatalogNotFound label="Movie" />
    </CatalogStatusShell>
  );
}
