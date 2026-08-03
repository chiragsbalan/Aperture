# pc.1 — Profile shell (unlisted cutover note)

Working release note for the profile-complete track slice `pc.1`.

## User-visible

- Public profile shell at `/u/{username}`: avatar (HTTPS URL or initials), bio, website/links, counters, full tab nav (stubs until later slices).
- Settings: avatar URL, website, up to 3 links.
- Watchlist / Favorites: visibility toggle (Public / Private) on the library list pages.
- Custom lists: Unlisted removed — Public or Private only.

## Breaking

- **`unlisted` list visibility removed.** Existing unlisted lists were migrated to **private**. Old unlisted share links no longer work for non-owners (404).
