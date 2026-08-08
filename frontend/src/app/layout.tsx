import { AuthProvider } from '@/components/auth-provider';
import { NavigationPending } from '@/components/navigation-pending';
import { ThemeSync } from '@/components/theme-sync';
import { TitlePosterBackMorph } from '@/components/title-poster-back-morph';
import { TitlePosterFlightAbandon } from '@/components/title-poster-flight-abandon';
import { SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT } from '@/lib/shell-atmosphere';
import type { Metadata } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import Script from 'next/script';
import { Suspense } from 'react';

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
      // beforeInteractive shell-atmosphere script sets ``--shell-glow-*`` on
      // ``<html>`` before hydrate; without this React warns on the mismatch.
      suppressHydrationWarning
    >
      <body className="antialiased">
        <Script
          id="shell-atmosphere-randomize"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT,
          }}
        />
        <AuthProvider>
          <ThemeSync />
          <TitlePosterBackMorph />
          <TitlePosterFlightAbandon />
          <Suspense fallback={null}>
            <NavigationPending />
          </Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
