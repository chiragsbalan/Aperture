'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Shared title poster used on detail and “more like this”.
 *
 * Failed-load state is owned by an inner wrapper keyed on ``url`` so a new
 * image remounts clean state without a reset effect.
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
  return (
    <CatalogPosterInner
      key={url ?? ''}
      url={url}
      alt={alt}
      priority={priority}
      sizes={sizes}
      aspectClassName={aspectClassName}
      className={className}
    />
  );
}

function CatalogPosterInner({
  url,
  alt,
  priority,
  sizes,
  aspectClassName,
  className,
}: {
  url: string | null;
  alt: string;
  priority: boolean;
  sizes: string;
  aspectClassName: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);

  const frameClass = [
    aspectClassName,
    'w-full overflow-hidden rounded-[var(--radius-sm)] ring-1 ring-[var(--color-border)]',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!url || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-[var(--color-bg-elevated)] text-[length:var(--text-xs)] text-muted sm:text-sm ${frameClass}`}
      >
        No image
      </div>
    );
  }

  return (
    <div className={`relative shadow-[var(--elev-poster)] ${frameClass}`}>
      <Image
        src={url}
        alt={alt}
        fill
        priority={priority}
        className="object-cover object-top"
        sizes={sizes}
        onError={() => {
          setFailed(true);
        }}
      />
    </div>
  );
}
