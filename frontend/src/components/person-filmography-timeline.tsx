import { TitleTextLink } from '@/components/title-text-link';
import type { PersonTitleCard } from '@/lib/catalog';

/**
 * Text-only filmography: year section heads and title rows.
 * A hairline separates years only, not titles in the same year.
 * Profession filter lives in FormSelect; rows show title links only.
 */
export function PersonFilmographyTimeline({
  yearGroups,
}: {
  yearGroups: Array<{ yearLabel: string; cards: PersonTitleCard[] }>;
}) {
  if (yearGroups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 divide-y divide-[var(--color-border)]">
      {yearGroups.map((group) => (
        <div key={group.yearLabel} className="py-3 first:pt-0">
          <h3 className="text-sm font-medium text-muted">{group.yearLabel}</h3>
          <ul className="mt-1">
            {group.cards.map((card, index) => (
              <li
                key={`${card.type}-${card.content_id ?? card.tmdb_id}-${card.credit_kind ?? ''}-${card.job ?? ''}-${card.character ?? ''}-${index}`}
                className="py-1.5 text-sm sm:py-2"
              >
                <TitleTextLink
                  contentId={card.content_id}
                  tmdbId={card.tmdb_id}
                  kind={card.type}
                >
                  {card.title}
                </TitleTextLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
