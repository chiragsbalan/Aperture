import { redirect } from 'next/navigation';

interface TvFansRedirectProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/** Old /fans URL → Activity. */
export default async function TvFansRedirect({
  params,
  searchParams,
}: TvFansRedirectProps) {
  const { id } = await params;
  const query = await searchParams;
  const tabQuery =
    query.tab != null && query.tab !== ''
      ? `?tab=${encodeURIComponent(query.tab)}`
      : '';
  redirect(`/tv/${encodeURIComponent(id)}/activity${tabQuery}`);
}
