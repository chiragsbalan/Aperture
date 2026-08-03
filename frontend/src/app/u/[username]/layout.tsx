import type { Metadata } from 'next';
import type { ReactNode } from 'react';

interface ProfileSegmentLayoutProps {
  children: ReactNode;
  params: Promise<{ username: string }>;
}

export async function generateMetadata({
  params,
}: ProfileSegmentLayoutProps): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} · Aperture`,
    description: `Public profile for @${username} on Aperture.`,
  };
}

/** Shared segment wrapper — profile shell and collection pages opt in separately. */
export default function ProfileSegmentLayout({
  children,
}: ProfileSegmentLayoutProps) {
  return children;
}
