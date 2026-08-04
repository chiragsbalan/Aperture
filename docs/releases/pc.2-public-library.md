# pc.2 — Public lists + always-public watchlist

Working release note for the profile-complete track slice `pc.2`.

## Breaking changes

- **Watchlist is always public.** Any watchlist previously set to private becomes world-readable after migration. There is no visibility toggle.
- **Favorites are always private.** Public favorites toggles are removed; existing public favorites rows are forced private.
- **Custom list visibility** is **`public` | `private`** only (UI: Anyone / Private). Default on create is **public**. Any `unlisted` rows are coerced to `private`; there is no link-only middle state.

## Product surfaces

- ProfileNav: Diary · Watchlist · Lists · Activity · Reviews (Favorites removed from public nav).
- **Watchlist** is its own always-public tab (`/u/{username}/watchlist`) for every viewer.
- **Lists** tab is custom lists only; owners see every list; visitors see public customs only.
- Owner workspace stays `/library/*`.

## Activity

Activity tab remains a stub. Verb contract for pc.7 is reserved in the track doc / ADRs — **no activity emit paths in pc.2**.

## Also included

- Optional diary **half-star ratings** on create/edit (`watch_entries.rating`, 0.5–5.0) and green star UI on diary cards.
- `GET /me/watch-entries/contains` for title-page Log membership (independent Redis rate-limit namespace).
- Signed-in home catalogue rails (now in theatres / top movies / top TV) via shared `HomeCatalogRail`.
- Public custom-list GETs (`/lists/{id}`, `/lists/{id}/items`) share the users public IP rate-limit bucket.
