import { initialsFromProfile } from '@/lib/profile';

interface ProfileAvatarProps {
  username: string;
  displayName?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

export function ProfileAvatar({
  username,
  displayName,
  size = 'md',
}: ProfileAvatarProps) {
  const initials = initialsFromProfile(displayName, username);
  const sizeClass =
    size === 'lg'
      ? 'h-20 w-20 text-2xl'
      : size === 'sm'
        ? 'h-10 w-10 text-sm sm:h-11 sm:w-11 sm:text-base'
        : 'h-12 w-12 text-base';

  return (
    <div
      className={`inline-flex items-center justify-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] font-display font-semibold tracking-wide text-foreground ${sizeClass}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
