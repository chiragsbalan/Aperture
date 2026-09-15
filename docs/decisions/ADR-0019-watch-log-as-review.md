# ADR-0019 — Watch-log-as-review (eligibility, votes, spoilers)

- **Status:** Accepted
- **Date:** 2026-09-14
- **Related:** [ADR-0008](ADR-0008-personal-library-lists.md) (diary / `watch_entries`); [ADR-0015](ADR-0015-title-ratings.md) (community title score); [ADR-0009](ADR-0009-public-profiles.md) (public profile tabs)
- **Implements in:** P4.2 — merged on `main` (PR #60)
- **Amended:** 2026-09-15 — title Activity surface, related tabs, ratings/lists APIs, profile Reviews tab, spoiler tap-to-reveal
- **Does not consume:** ADR-0007 (OpenSearch; still reserved)

## Context

Title pages needed a public Reviews section. Diary already stores optional notes and half-star ratings on `watch_entries`. A second reviews table would duplicate the log, split composers, and drift from “review is something you wrote when you logged a watch.”

Community title stars are already specified in ADR-0015 (`content_rating_stats`, latest non-null diary rating per user). Review helpfulness (likes/dislikes) is a different signal and must not become a second title average.

Spoiler text and per-viewer vote pressed-state cannot live in cached movie/TV RSC HTML (`revalidate=300`).

## Decision

**A review is a watch log.** There is no `reviews` table and no standalone composer. Users add a review only via Log watch or diary edit.

### Eligibility (title page and profile Reviews tab)

A log is shown as a review only when **all** are true:

1. `note` trimmed is non-empty
2. `rating` is set
3. The owner is not soft-deleted
4. The content row exists

Diary still lists every log (notes-only, ratings-only, unrated). Diary notes are **never** spoiler-blurred.

Every qualifying rewatch is its **own** card. Card stars are **that log’s** rating, not the ADR-0015 title score.

Once eligible, reviews are world-readable. No private/unlisted/server drafts. PATCH that clears note or rating drops the card immediately. Delete stays diary confirm (no Undo) and cascades votes.

### Votes

Table `review_votes`: `(watch_entry_id, voter_user_id)` unique, `vote` in `{+1, -1}`, CASCADE on watch-entry delete.

Denormalized `like_count` / `dislike_count` on `watch_entries`, updated in the same transaction as the vote (delta, not recount). Displayed **score** = likes − dislikes (signed text: `+3`, `0`, `-3`).

Toggle: like again clears; dislike while liked switches (symmetric). **Self-vote is 403** (`self_vote_forbidden`). Missing, ineligible, or other-user-hidden targets are **404** (IDOR-style). Guests may read scores and cannot vote.

Votes are **not** the community star average. ADR-0015 (`content_rating_stats` / latest diary rating) is unchanged.

### Spoilers

Author boolean `contains_spoilers` on the log (default false), set on create and diary edit. Viewer preference `show|hide` (default show). **Guests are hide.** Authors always see their own body.

Public list APIs **omit `note`** on spoiler-marked cards for every non-author viewer, even when the viewer’s spoiler preference is **show**. Preference only drives the default **`spoiler_filter`** (`all` vs `no_spoilers`) on list queries; it does **not** auto-include bodies in list responses.

Per-card reveal uses either:

- `include_note_ids` (repeatable UUIDs) on a list GET, or
- `GET …/reviews/{entry_id}` (single review; always includes the body for eligible rows)

The UI shows a **tap-to-reveal** gate on any spoiler card whose `note` is absent, including for signed-in **show** viewers. Blur/hide applies on title-detail related tabs, title Activity, and the profile Reviews tab. Diary notes are never spoiler-gated.

Do **not** bake personalized vote pressed-state or spoiler bodies into cached title HTML. Title reviews are fetched by client islands (same idea as `LibraryActions`).

### API

- `GET /api/v1/movies/{id}/reviews` and `GET /api/v1/tv/{id}/reviews` (public; default sort `popular`; query `spoiler_filter`, `rating_filter`, `include_note_ids`)
- `GET /api/v1/movies/{id}/reviews/{entry_id}` and `GET /api/v1/tv/{id}/reviews/{entry_id}` (public single-card reveal; includes spoiler body)
- `GET /api/v1/movies/{id}/ratings` and `GET /api/v1/tv/{id}/ratings` (public; latest non-null diary rating per live user — same aggregation rule as [ADR-0015](ADR-0015-title-ratings.md); default sort `highest`)
- `GET /api/v1/movies/{id}/lists` and `GET /api/v1/tv/{id}/lists` (public custom lists that contain the title; `public` visibility only; ordered by list `updated_at` DESC)
- `GET /api/v1/users/{username}/reviews` (public; default sort `recent`; soft-deleted username → 404)
- `PUT /api/v1/me/watch-entries/{id}/vote` body `{ vote: 1 | -1 | null }`
- `contains_spoilers` on watch-entry create/patch

Public types stay `movie|tv`. Review/rating list queries live in the library service; public-lists-for-title in the lists service; title HTTP routes stay in the API layer (`catalog.py`) so metadata does not import library (import-linter). Title activity GETs share the **`users_public`** IP rate-limit bucket ([ADR-0009](ADR-0009-public-profiles.md)).

Client may keep an in-progress log draft in `sessionStorage` keyed by content ref. After same-tab login, restore the draft and **do not** auto-submit.

### Title Activity and related tabs (P4.2 amendment)

**Title detail** embeds a second in-page tab strip (`TitleRelatedTabs`): **Similar → Reviews → Ratings → Lists**. Default selected tab is **Similar**. Each non-Similar panel shows an inline preview (limit **5** rows/cards). **See all** on the active tab links to the full Activity page for that tab.

**Title Activity** is a dedicated route per kind:

- `/movies/{id}/activity` and `/tv/{id}/activity`
- Same four tabs and order; URL `?tab=similar|ratings|lists` selects the tab (**Reviews** is the default when `tab` is absent)
- Paginated panels (page size **24**); Similar shows up to **30** posters on Activity (detail Similar grid shows **6**)
- Title metadata may stay in cached RSC (`revalidate=300`); tab bodies are client-fetched (`Cache-Control: private, no-store` on activity APIs)

**Redirects:** legacy `/movies|tv/{id}/similar` → `/…/activity?tab=similar`. Legacy `/fans` → `/activity` (preserves `?tab=` when present).

**Profile Reviews** (`/u/{username}/reviews`) is a real paginated feed of the owner’s qualifying logs (same eligibility rule; default sort `recent`; title poster on each card). **Profile Activity** remains a stub (“No activity yet.”).

### Explicit non-goals (unchanged)

- Activity-feed **emit** on new reviews / ratings / list adds
- Follows / followers (counters stay **0**; no follow table)
- Review **comments** / replies

## Alternatives considered

1. **Separate `reviews` table / composer** — rejected. Duplicates the diary row and splits the write path.
2. **One review per user per title** — rejected. Rewatches are distinct logs and distinct cards.
3. **Votes as the community star score** — rejected. ADR-0015 already defines title stars from diary ratings.
4. **Spoiler bodies in RSC title HTML** — rejected. Cache would leak hidden text and vote state.
5. **403 for foreign vote targets** — rejected. 404 avoids confirming another user’s hidden/ineligible ids.

## Consequences

- Title Reviews and profile Reviews are the same eligibility rule.
- Helpfulness ranking (`popular`) can differ from ADR-0015 title score on the same page.
- Every non-author viewer needs an explicit reveal (tap → single-review GET, or `include_note_ids`) before spoiler text enters the tree, regardless of spoiler preference.
- Title Activity consolidates Similar, Reviews, Ratings, and public Lists for a title; dedicated similar shelf URLs redirect there.
- Follows and profile Activity feed remain out of scope (no table; Activity tab stub).

## Future evolution

- Review comments / replies
- Activity-feed emission for new reviews / ratings / list events (profile Activity tab)
- Permalinks and histograms (title hero stars stay ADR-0015)
