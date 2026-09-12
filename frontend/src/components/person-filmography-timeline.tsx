import { TitleTextLink } from '@/components/title-text-link';
import type { PersonTitleCard } from '@/lib/catalog';

/**
 * Text-only filmography: year section heads + divide-y title rows.
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
    <div className="mt-3 space-y-4">
      {yearGroups.map((group) => (
        <div key={group.yearLabel}>
          <h3 className="text-sm font-medium text-muted">{group.yearLabel}</h3>
          <ul className="mt-1 divide-y divide-[var(--color-border)]">
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
