import { initialsFromProfile } from '@/lib/profile';

interface ProfileAvatarProps {
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function ProfileAvatar({
  username,
  displayName,
  avatarUrl,
  size = 'md',
}: ProfileAvatarProps) {
  const initials = initialsFromProfile(displayName, username);
  const sizeClass =
    size === 'lg'
      ? 'h-20 w-20 text-2xl'
      : size === 'sm'
        ? 'h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base'
        : 'h-12 w-12 text-base';

  if (avatarUrl) {
    return (
      // next/image needs a configured remote host; plain img works for any
      // allowlisted CSP media host (R2 custom domain).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={80}
        height={80}
        className={`inline-block rounded-[var(--radius-pill)] border border-[var(--color-border)] object-cover ${sizeClass}`}
        decoding="async"
      />
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] font-display font-semibold tracking-wide text-foreground ${sizeClass}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
