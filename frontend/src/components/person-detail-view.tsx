'use client';

import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/components/auth-provider';
import { CatalogPoster } from '@/components/catalog-poster';
import { FormSelect } from '@/components/form-select';
import { PersonFilmographyTimeline } from '@/components/person-filmography-timeline';
import { PersonKnownFor } from '@/components/person-known-for';
import { ShelfInfiniteScroll } from '@/components/shelf-infinite-scroll';
import { TitleMetaRow, TitleMetaStack } from '@/components/title-meta-stack';
import { TitleOverview } from '@/components/title-overview';
import type { PersonDetail } from '@/lib/catalog';
import { formatIsoMonthYear } from '@/lib/iso_date';
import { fetchWatchEntryRatings, membershipKey } from '@/lib/library';
import { filmographyHeading } from '@/lib/person-filmography-heading';
import {
  buildPersonFilmographyTimeline,
  groupFilmographyByYear,
  PERSON_FILMOGRAPHY_SORT_OPTIONS,
  resolvePersonDepartment,
  type PersonFilmographySort,
} from '@/lib/person-filmography-sort';
import { TITLE_SHELF_PAGE_SIZE } from '@/lib/title-shelf';

const FALLBACK_DEPARTMENTS = ['Acting'];

function isYourRatingSort(sort: PersonFilmographySort): boolean {
  return sort === 'your_rating_high' || sort === 'your_rating_low';
}

export function PersonDetailView({ person }: { person: PersonDetail }) {
  const { status: authStatus } = useAuth();
  const signedIn = authStatus === 'signed_in';
  const departments =
    person.departments.length > 0 ? person.departments : FALLBACK_DEPARTMENTS;
  const defaultDepartment = resolvePersonDepartment(
    person.known_for_department,
    departments,
  );
  const [department, setDepartment] = useState(defaultDepartment);
  const [sort, setSort] = useState<PersonFilmographySort>('popularity');
  const [visibleCount, setVisibleCount] = useState(TITLE_SHELF_PAGE_SIZE);
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  const needsMyRatings = signedIn && isYourRatingSort(sort);

  const ratingRefs = useMemo(() => {
    if (!needsMyRatings) {
      return [];
    }
    const seen = new Set<string>();
    const refs: Array<{ type: 'movie' | 'tv'; id: string }> = [];
    for (const film of person.filmography) {
      if (film.content_id == null) {
        continue;
      }
      const key = membershipKey(film.type, film.content_id);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      refs.push({ type: film.type, id: film.content_id });
    }
    return refs.slice(0, 150);
  }, [needsMyRatings, person.filmography]);

  useEffect(() => {
    if (!needsMyRatings) {
      setMyRatings({});
      return;
    }
    if (ratingRefs.length === 0) {
      setMyRatings({});
      return;
    }
    let cancelled = false;
    void fetchWatchEntryRatings(ratingRefs).then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      setMyRatings(result.ratings);
    });
    return () => {
      cancelled = true;
    };
  }, [needsMyRatings, ratingRefs]);

  useEffect(() => {
    if (!signedIn && isYourRatingSort(sort)) {
      setSort('popularity');
    }
  }, [signedIn, sort]);

  useEffect(() => {
    setDepartment(
      resolvePersonDepartment(person.known_for_department, departments),
    );
    setVisibleCount(TITLE_SHELF_PAGE_SIZE);
  }, [person.id, person.known_for_department, departments]);

  const filtered = useMemo(
    () =>
      person.filmography.filter(
        (film) => (film.department || 'Acting') === department,
      ),
    [department, person.filmography],
  );

  const timeline = useMemo(
    () => buildPersonFilmographyTimeline(filtered, sort, myRatings),
    [filtered, sort, myRatings],
  );

  const flatTimeline = useMemo(
    () => timeline.flatMap((group) => group.cards),
    [timeline],
  );

  const visible = flatTimeline.slice(0, visibleCount);
  const yearGroups = useMemo(() => groupFilmographyByYear(visible), [visible]);
  const hasMore = visibleCount < flatTimeline.length;
  const bio = person.biography?.trim() ?? '';
  const bornLabel = formatIsoMonthYear(person.birthday);
  const diedLabel = formatIsoMonthYear(person.deathday);
  const hasFacts =
    Boolean(person.known_for_department) ||
    bornLabel != null ||
    diedLabel != null ||
    Boolean(person.place_of_birth) ||
    person.also_known_as.length > 0;

  const departmentOptions = departments.map((value) => ({
    value,
    label: value,
  }));
  const sortOptions = PERSON_FILMOGRAPHY_SORT_OPTIONS.filter(
    (option) => signedIn || !option.signedInOnly,
  ).map((option) => ({
    value: option.value,
    label: option.label,
  }));

  const resetWindow = () => {
    setVisibleCount(TITLE_SHELF_PAGE_SIZE);
  };

  return (
    <article className="layout-content layout-shell-pad-top pb-16 text-left sm:pb-24">
      <div className="catalog-detail-hero">
        <div className="catalog-detail-hero-art">
          <CatalogPoster
            url={person.profile_url}
            alt={person.name}
            priority
            sizes="(max-width: 640px) 108px, 288px"
          />
        </div>
        <div className="motion-fade-rise catalog-detail-hero-heading">
          <h1 className="type-title-person text-foreground">{person.name}</h1>
          {hasFacts ? (
            <TitleMetaStack>
              {person.known_for_department ? (
                <TitleMetaRow>
                  <span>{person.known_for_department}</span>
                </TitleMetaRow>
              ) : null}
              {bornLabel ? (
                <TitleMetaRow>
                  <span>Born {bornLabel}</span>
                </TitleMetaRow>
              ) : null}
              {diedLabel ? (
                <TitleMetaRow>
                  <span>Died {diedLabel}</span>
                </TitleMetaRow>
              ) : null}
              {person.place_of_birth ? (
                <TitleMetaRow>
                  <span>{person.place_of_birth}</span>
                </TitleMetaRow>
              ) : null}
              {person.also_known_as.length > 0 ? (
                <TitleMetaRow>
                  <span>
                    Also known as {person.also_known_as.slice(0, 6).join(', ')}
                  </span>
                </TitleMetaRow>
              ) : null}
            </TitleMetaStack>
          ) : null}
          {person.socials.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2 sm:mt-4">
              {person.socials.map((social) => (
                <li key={`${social.kind}-${social.url}`}>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="motion-fade-rise catalog-detail-hero-body">
          {bio ? (
            <TitleOverview text={bio} />
          ) : (
            <p className="text-xs text-muted sm:mt-7 sm:text-sm">
              No biography yet.
            </p>
          )}
          <hr className="title-actions-rule" />
          <PersonKnownFor items={person.known_for} />
          {filtered.length > 0 ? (
            <section className="mt-8 w-full text-left sm:mt-10">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] pb-2">
                <h2 className="type-section text-foreground">
                  {filmographyHeading(person.name, department)}
                </h2>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:w-56">
                  <span
                    id="person-profession-label"
                    className="block text-sm text-muted"
                  >
                    Profession
                  </span>
                  <FormSelect
                    id="person-profession"
                    aria-labelledby="person-profession-label"
                    value={department}
                    options={departmentOptions}
                    onChange={(value) => {
                      setDepartment(value);
                      resetWindow();
                    }}
                    className="mt-1"
                  />
                </div>
                <div className="w-full sm:w-56">
                  <span
                    id="person-sort-label"
                    className="block text-sm text-muted"
                  >
                    Sort
                  </span>
                  <FormSelect
                    id="person-sort"
                    aria-labelledby="person-sort-label"
                    value={sort}
                    options={sortOptions}
                    onChange={(value) => {
                      setSort(value);
                      resetWindow();
                    }}
                    className="mt-1"
                  />
                </div>
              </div>
              <PersonFilmographyTimeline yearGroups={yearGroups} />
              <ShelfInfiniteScroll
                hasMore={hasMore}
                loadingMore={false}
                onLoadMore={() => {
                  setVisibleCount((count) =>
                    Math.min(
                      count + TITLE_SHELF_PAGE_SIZE,
                      flatTimeline.length,
                    ),
                  );
                }}
                statusText={`Showing ${visible.length} of ${flatTimeline.length}`}
              />
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
