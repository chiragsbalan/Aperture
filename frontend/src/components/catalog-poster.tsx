import Image from 'next/image';

/**
 * Shared title poster used on detail and “more like this”.
 */
export function CatalogPoster({
  url,
  alt,
  priority = false,
  sizes = '(max-width: 640px) 70vw, 288px',
  aspectClassName = 'aspect-[2/3]',
  className = '',
}: {
  url: string | null;
  alt: string;
  priority?: boolean;
  sizes?: string;
  /** Tailwind aspect utility; default full poster 2:3. */
  aspectClassName?: string;
  className?: string;
}) {
  const frameClass = [
    aspectClassName,
    'w-full overflow-hidden rounded-[var(--radius-sm)] ring-1 ring-[var(--color-border)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!url) {
    return (
      <div
        aria-hidden
        className={`flex items-center justify-center bg-[var(--color-bg-elevated)] text-sm text-muted ${frameClass}`}
      >
        No image
      </div>
    );
  }
  return (
    <div
      className={`relative shadow-[0_24px_60px_rgba(0,0,0,0.45)] ${frameClass}`}
    >
      <Image
        src={url}
        alt={alt}
        fill
        priority={priority}
        className="object-cover object-top"
        sizes={sizes}
      />
    </div>
  );
}
