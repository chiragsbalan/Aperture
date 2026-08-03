import Image from 'next/image';

import type { WatchProvider, WatchProviderRegion } from '@/lib/catalog';
import { watchProviderUrl } from '@/lib/watch-provider-links';

const REGION_PREFERENCE = ['IN', 'US', 'GB', 'CA', 'AU'];
const MAX_SITES = 5;

type OfferTag = 'STREAM' | 'RENT' | 'BUY';

interface MergedProvider {
  providerId: number | null;
  providerName: string;
  logoUrl: string | null;
  displayPriority: number;
  tags: OfferTag[];
  rank: number;
}

function pickRegion(
  providers: Record<string, WatchProviderRegion>,
): { region: string; data: WatchProviderRegion } | null {
  for (const code of REGION_PREFERENCE) {
    const data = providers[code];
    if (
      data &&
      (data.flatrate.length ||
        data.rent.length ||
        data.buy.length ||
        data.free.length ||
        data.ads.length)
    ) {
      return { region: code, data };
    }
  }
  for (const [region, data] of Object.entries(providers)) {
    if (
      data.flatrate.length ||
      data.rent.length ||
      data.buy.length ||
      data.free.length ||
      data.ads.length
    ) {
      return { region, data };
    }
  }
  return null;
}

function mergeProviders(data: WatchProviderRegion): MergedProvider[] {
  const byKey = new Map<string, MergedProvider>();

  function upsert(provider: WatchProvider, tag: OfferTag, rank: number) {
    const key = String(
      provider.provider_id ?? provider.provider_name.toLowerCase(),
    );
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        providerId: provider.provider_id,
        providerName: provider.provider_name,
        logoUrl: provider.logo_url,
        displayPriority: provider.display_priority ?? 999,
        tags: [tag],
        rank,
      });
      return;
    }
    if (!existing.tags.includes(tag)) {
      existing.tags.push(tag);
      existing.tags.sort((a, b) => {
        const order: Record<OfferTag, number> = {
          STREAM: 0,
          RENT: 1,
          BUY: 2,
        };
        return order[a] - order[b];
      });
    }
    existing.rank = Math.min(existing.rank, rank);
    existing.displayPriority = Math.min(
      existing.displayPriority,
      provider.display_priority ?? 999,
    );
    if (!existing.logoUrl && provider.logo_url) {
      existing.logoUrl = provider.logo_url;
    }
  }

  for (const provider of [...data.flatrate, ...data.free, ...data.ads]) {
    upsert(provider, 'STREAM', 0);
  }
  for (const provider of data.rent) {
    upsert(provider, 'RENT', 1);
  }
  for (const provider of data.buy) {
    upsert(provider, 'BUY', 2);
  }

  return [...byKey.values()]
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return a.displayPriority - b.displayPriority;
    })
    .slice(0, MAX_SITES);
}

/**
 * Streaming / rent / buy list sized to match the poster column.
 */
export function WhereToWatch({
  providers,
  title,
}: {
  providers: Record<string, WatchProviderRegion>;
  title: string;
}) {
  const picked = pickRegion(providers);
  if (!picked) {
    return null;
  }
  const sites = mergeProviders(picked.data);
  if (sites.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 w-full text-left">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[length:var(--text-xs)] font-semibold tracking-[var(--tracking-wider)] text-muted">
          WHERE TO WATCH
        </h2>
        <span className="text-xs text-muted">{picked.region}</span>
      </div>
      <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50 px-3 py-1">
        <ul>
          {sites.map((site) => {
            const href = watchProviderUrl({
              providerId: site.providerId,
              providerName: site.providerName,
              title,
              region: picked.region,
            });
            return (
              <li key={`${site.providerId}-${site.providerName}`}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 border-b border-[var(--color-border)] py-2.5 transition last:border-b-0 hover:bg-[var(--color-bg-elevated)]/80"
                >
                  <span className="provider-logo-mask relative h-8 w-8 shrink-0 overflow-hidden">
                    {site.logoUrl ? (
                      <Image
                        src={site.logoUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="block h-full w-full bg-[var(--color-border)]"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {site.providerName}{' '}
                    <span className="text-muted">{picked.region}</span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {site.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-1.5 py-0.5 text-[length:var(--text-eyebrow)] tracking-[var(--tracking-wide)] text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
