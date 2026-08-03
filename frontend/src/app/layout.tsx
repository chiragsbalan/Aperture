import { ThemeSync } from '@/components/theme-sync';
import { TitlePosterBackMorph } from '@/components/title-poster-back-morph';
import { TitlePosterFlightAbandon } from '@/components/title-poster-flight-abandon';
import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';

import './globals.css';

const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  display: 'swap',
});

const sourceSans = Source_Sans_3({
  variable: '--font-source-sans',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Aperture',
  description: 'A cinematic window into film and television.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${fraunces.variable} ${sourceSans.variable}`}
    >
      <body className="antialiased">
        <ThemeSync />
        <TitlePosterBackMorph />
        <TitlePosterFlightAbandon />
        {children}
      </body>
    </html>
  );
}
