import { DiaryPage } from '@/components/diary-page';
import { SiteHeader } from '@/components/site-header';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Diary · Aperture',
  description: 'Your watch diary on Aperture.',
};

export default function LibraryDiaryPage() {
  return (
    <main className="shell-atmosphere relative flex min-h-dvh flex-col items-center px-6 py-24">
      <SiteHeader />
      <DiaryPage />
    </main>
  );
}
