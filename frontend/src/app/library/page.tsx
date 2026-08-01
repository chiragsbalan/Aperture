import { redirect } from 'next/navigation';

export default function LibraryIndexPage() {
  redirect('/library/watchlist');
}
