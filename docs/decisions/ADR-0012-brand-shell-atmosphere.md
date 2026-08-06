# ADR-0012 — Brand accent + shell atmosphere

- **Status:** Accepted
- **Date:** 2026-08-06
- **Related:** [ADR-0010](ADR-0010-guest-landing-home-shell.md) (guest mosaic shell — atmosphere excluded); Frontend UI tokens (`tokens.css`, `globals.css`)
- **Implements in:** Purple brand + dual-lobe atmosphere (PR #36); mobile tap outline suppression (PR #37); guest atmosphere removal + stable mosaic hero (`feature/guest-mosaic-no-atmosphere`)

## Context

Aperture’s authenticated and catalog surfaces need a shared cinematic wash that reads as brand, not generic SaaS purple. An earlier amber/green atmosphere and leaf-green accent competed with library action colors and made overlays feel off-brand. Guest conversion surfaces already have a dense poster mosaic; stacking randomized full-page glow lobes on top was noisy and harder to keep stable on mobile scroll.

## Decision

### Brand accent

- Product accent is **purple** (`--color-accent` / focus / primary CTAs / tabs / log action).
- Library action semantics stay distinct: watchlist gold, favorites rose, lists sky (`--color-action-*`).
- Leaf-green is not the product accent.

### Shell atmosphere (where it applies)

- Authenticated / catalog / library / profile / search / title shells use `.shell-atmosphere`: four randomized purple + blue lobes, charcoal sheet (`--bg-glow-sheet`), and vignette.
- Randomization: pure helper + generated inline `beforeInteractive` script from `frontend/src/lib/shell-atmosphere.ts` (`SHELL_ATMOSPHERE_RANDOMIZE_SCRIPT`). Writes `--shell-glow-*` only on `document.documentElement` via `setProperty` (never `cssText`, never retarget `.shell-atmosphere`).
- bfcache: same script re-rolls on `pageshow` when `event.persisted`, with a one-time bind guard. No root-layout client component solely for atmosphere.
- Overlays share purple/blue frosted fill via `--overlay-surface-bg` (`.overlay-surface` / `.overlay-surface-field`).
- Do **not** put `contain: paint` (or fixed atmosphere `::before`) on `.shell-atmosphere` — it breaks in-tree `position: fixed` (e.g. ActionToast).

### Explicit exclusion — guest surfaces

- Guest `/` and `(guest-shell)` (login/signup): **mosaic + veil + solid page background only**. No `.shell-atmosphere` / `.shell-atmosphere-mosaic` page wash.
- Guest hero / shell height uses **`min-h-svh`** so mosaic coverage does not grow when mobile browser chrome collapses (see ADR-0010).

### Mobile focus / tap

- `-webkit-tap-highlight-color: transparent` on `html`.
- On coarse pointers (`hover: none` and `pointer: coarse`), suppress sticky `:focus-visible` outline after tap. Desktop / fine-pointer keyboard focus rings remain.

## Alternatives considered

1. **Keep amber / green atmosphere with green brand** — rejected; product locked purple brand + distinct purple/blue lobes.
2. **Atmosphere on guest mosaic pages** — rejected after ship; mosaic already carries visual density; lobes fought readability and mobile layout stability.
3. **External `public/*.js` beforeInteractive script** — rejected for first paint; separate fetch risks FOUC vs inline generated script (CSP already allows `'unsafe-inline'`).
4. **`contain: paint` on `.shell-atmosphere` for scroll paint isolation** — rejected; reanchors fixed descendants.
5. **Remove all focus rings including keyboard** — rejected; coarse-pointer suppression only.

## Consequences

- Token and overlay changes must preserve purple/blue language and guest exclusion.
- Atmosphere script algorithm stays single-sourced (helper + generated IIFE + vitest sync lock).
- Guest visual regressions: unexpected page lobes, or mosaic elongation on mobile scroll.
- Signed-in and catalog pages keep the randomized wash; theme toggle continues to resolve lobe colors through `var(--bg-glow-*)`.

## Future evolution

- Optional title-detail backdrop drift hue alignment with purple/blue tokens (separate from this ADR).
- CSP nonce/hash hardening if inline scripts are later eliminated app-wide.
