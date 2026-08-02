/**
 * TMDB watch/providers only expose a regional TMDB/JustWatch page, not
 * per-service deep links. Map known provider ids to the service site
 * (search when we have a title).
 */

interface ProviderSite {
  home: string;
  search?: (title: string, region: string) => string;
}

const PROVIDER_SITES: Record<number, ProviderSite> = {
  // Netflix
  8: {
    home: 'https://www.netflix.com',
    search: (title) =>
      `https://www.netflix.com/search?q=${encodeURIComponent(title)}`,
  },
  // Amazon Prime Video (+ regional / ads variants)
  9: {
    home: 'https://www.primevideo.com',
    search: (title) =>
      `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(title)}`,
  },
  119: {
    home: 'https://www.primevideo.com',
    search: (title) =>
      `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(title)}`,
  },
  2100: {
    home: 'https://www.primevideo.com',
    search: (title) =>
      `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(title)}`,
  },
  // Amazon Video (rent/buy)
  10: {
    home: 'https://www.amazon.com/gp/video/storefront',
    search: (title) =>
      `https://www.amazon.com/s?k=${encodeURIComponent(title)}&i=instant-video`,
  },
  // Apple TV / Store
  2: {
    home: 'https://tv.apple.com',
    search: (title) =>
      `https://tv.apple.com/search?term=${encodeURIComponent(title)}`,
  },
  350: {
    home: 'https://tv.apple.com',
    search: (title) =>
      `https://tv.apple.com/search?term=${encodeURIComponent(title)}`,
  },
  // Google Play Movies
  3: {
    home: 'https://play.google.com/store/movies',
    search: (title) =>
      `https://play.google.com/store/search?q=${encodeURIComponent(title)}&c=movies`,
  },
  // YouTube
  192: {
    home: 'https://www.youtube.com',
    search: (title) =>
      `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`,
  },
  // Disney+
  337: {
    home: 'https://www.disneyplus.com',
    search: (title) =>
      `https://www.disneyplus.com/search?q=${encodeURIComponent(title)}`,
  },
  // Hulu
  15: {
    home: 'https://www.hulu.com',
    search: (title) =>
      `https://www.hulu.com/search?q=${encodeURIComponent(title)}`,
  },
  // Max / HBO Max
  1899: {
    home: 'https://www.max.com',
    search: (title) =>
      `https://www.max.com/search?q=${encodeURIComponent(title)}`,
  },
  384: {
    home: 'https://www.max.com',
    search: (title) =>
      `https://www.max.com/search?q=${encodeURIComponent(title)}`,
  },
  // Paramount+
  531: {
    home: 'https://www.paramountplus.com',
    search: (title) =>
      `https://www.paramountplus.com/search/?q=${encodeURIComponent(title)}`,
  },
  // Peacock
  386: {
    home: 'https://www.peacocktv.com',
    search: (title) =>
      `https://www.peacocktv.com/search?q=${encodeURIComponent(title)}`,
  },
  // JioHotstar / Hotstar
  2336: {
    home: 'https://www.hotstar.com',
    search: (title, region) => {
      const locale = region.toLowerCase() === 'in' ? 'in' : 'us';
      return `https://www.hotstar.com/${locale}/search?q=${encodeURIComponent(title)}`;
    },
  },
  122: {
    home: 'https://www.hotstar.com',
    search: (title, region) => {
      const locale = region.toLowerCase() === 'in' ? 'in' : 'us';
      return `https://www.hotstar.com/${locale}/search?q=${encodeURIComponent(title)}`;
    },
  },
  // Fandango at Home (Vudu)
  7: {
    home: 'https://www.vudu.com',
    search: (title) =>
      `https://www.vudu.com/content/movies/search?searchString=${encodeURIComponent(title)}`,
  },
  // Plex
  538: {
    home: 'https://watch.plex.tv',
    search: (title) =>
      `https://watch.plex.tv/search?query=${encodeURIComponent(title)}`,
  },
  // Mubi
  11: {
    home: 'https://mubi.com',
    search: (title) => `https://mubi.com/search/${encodeURIComponent(title)}`,
  },
  // Tubi
  73: {
    home: 'https://tubitv.com',
    search: (title) => `https://tubitv.com/search/${encodeURIComponent(title)}`,
  },
};

/**
 * Build an outbound URL for a watch provider row.
 * Unknown providers fall back to a web search for “{name} {title}”.
 */
export function watchProviderUrl(options: {
  providerId: number | null;
  providerName: string;
  title: string;
  region: string;
}): string {
  const { providerId, providerName, title, region } = options;
  const site = providerId != null ? PROVIDER_SITES[providerId] : undefined;
  if (site) {
    if (title && site.search) {
      return site.search(title, region);
    }
    return site.home;
  }
  const query = [providerName, title, 'watch'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
