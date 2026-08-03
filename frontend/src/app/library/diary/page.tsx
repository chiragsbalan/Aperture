import { DiaryPage } from '@/components/diary-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diary · Aperture',
  description: 'Your watch diary on Aperture.',
};

export default function LibraryDiaryPage() {
  return (
    <div className="shell-atmosphere relative flex min-h-dvh flex-col items-center py-24">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content" className="relative z-[1] w-full">
        <DiaryPage />
      </main>
    </div>
  );
}
