import { initialsFromProfile } from '@/lib/profile';

interface ProfileAvatarProps {
  username: string;
  displayName?: string | null;
  size?: 'md' | 'lg';
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
      : 'h-12 w-12 text-base';

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-accent-soft)] font-display font-semibold tracking-wide text-foreground ${sizeClass}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
