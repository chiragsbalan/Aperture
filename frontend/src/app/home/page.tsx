import { redirect } from 'next/navigation';

/**
 * Legacy guest browse URL — chrome no longer links here; keep bookmarks working.
 */
export default function HomeAliasPage() {
  redirect('/');
}
