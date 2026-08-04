import { redirect } from 'next/navigation';

interface ProfileFavoritesRedirectProps {
  params: Promise<{ username: string }>;
}

/** Favorites left ProfileNav in pc.2 — bookmarks land on Lists. */
export default async function ProfileFavoritesRedirect({
  params,
}: ProfileFavoritesRedirectProps) {
  const { username } = await params;
  redirect(`/u/${encodeURIComponent(username)}/lists`);
}
