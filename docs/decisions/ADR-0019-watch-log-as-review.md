# ADR-0019 — Watch-log-as-review (eligibility, votes, spoilers)

- **Status:** Accepted
- **Date:** 2026-09-14
- **Related:** [ADR-0008](ADR-0008-personal-library-lists.md) (diary / `watch_entries`); [ADR-0015](ADR-0015-title-ratings.md) (community title score); [ADR-0009](ADR-0009-public-profiles.md) (public profile tabs)
- **Implements in:** `feature/p4.2-title-reviews`
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

Public list APIs **omit `note`** when the viewer must not see the spoiler. `include_note_ids` (repeatable UUIDs) reveals one card’s body without a new resource. Blur/hide applies on title-page cards and the profile Reviews tab only.

Do **not** bake personalized vote pressed-state or spoiler bodies into cached title HTML. Title reviews are fetched by a client island (same idea as `LibraryActions`).

### API

- `GET /api/v1/movies/{id}/reviews` and `GET /api/v1/tv/{id}/reviews` (public; default sort `popular`)
- `GET /api/v1/users/{username}/reviews` (public; default sort `recent`; soft-deleted username → 404)
- `PUT /api/v1/me/watch-entries/{id}/vote` body `{ vote: 1 | -1 | null }`
- `contains_spoilers` on watch-entry create/patch

Public types stay `movie|tv`. List queries live in the library service; title HTTP routes stay in the API layer (`catalog.py`) so metadata does not import library (import-linter).

Client may keep an in-progress log draft in `sessionStorage` keyed by content ref. After same-tab login, restore the draft and **do not** auto-submit.

## Alternatives considered

1. **Separate `reviews` table / composer** — rejected. Duplicates the diary row and splits the write path.
2. **One review per user per title** — rejected. Rewatches are distinct logs and distinct cards.
3. **Votes as the community star score** — rejected. ADR-0015 already defines title stars from diary ratings.
4. **Spoiler bodies in RSC title HTML** — rejected. Cache would leak hidden text and vote state.
5. **403 for foreign vote targets** — rejected. 404 avoids confirming another user’s hidden/ineligible ids.

## Consequences

- Title Reviews and profile Reviews are the same eligibility rule.
- Helpfulness ranking (`popular`) can differ from ADR-0015 title score on the same page.
- Guests and hide-pref viewers need a reveal round-trip (`include_note_ids`) before spoiler text enters the tree.
- Follows remain out of scope (no table); seed cannot fill followers/following.

## Future evolution

- Review comments / replies
- Activity-feed emission for new reviews
- Permalinks and histograms (still ADR-0015 for title stars)
