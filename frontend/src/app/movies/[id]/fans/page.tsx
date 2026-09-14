import { redirect } from 'next/navigation';

interface MovieFansRedirectProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

/** Old /fans URL → Activity. */
export default async function MovieFansRedirect({
  params,
  searchParams,
}: MovieFansRedirectProps) {
  const { id } = await params;
  const query = await searchParams;
  const tabQuery =
    query.tab != null && query.tab !== ''
      ? `?tab=${encodeURIComponent(query.tab)}`
      : '';
  redirect(`/movies/${encodeURIComponent(id)}/activity${tabQuery}`);
}
