import type { ListVisibility } from '@/lib/library';
import { listVisibilityLabel } from '@/lib/library';

function LockOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function GlobeOutlineIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

/**
 * Custom list name + outline lock (private) / globe (public) mark.
 * Use everywhere a list title is displayed (not edit form controls).
 */
export function ListTitleWithVisibility({
  title,
  visibility,
  className,
}: {
  title: string;
  visibility: ListVisibility;
  className?: string;
}) {
  const Icon = visibility === 'public' ? GlobeOutlineIcon : LockOutlineIcon;
  return (
    <span
      className={[
        'inline-flex min-w-0 max-w-full items-center gap-1.5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${title}, ${listVisibilityLabel(visibility)}`}
    >
      <span className="min-w-0 truncate">{title}</span>
      <Icon className="shrink-0 text-[0.85em] text-muted" />
    </span>
  );
}
