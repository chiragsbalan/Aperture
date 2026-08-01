import { CustomListsPage } from '@/components/custom-lists-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Lists · Aperture',
  description: 'Your custom lists on Aperture.',
};

export default function LibraryListsPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <CustomListsPage />
    </main>
  );
}
