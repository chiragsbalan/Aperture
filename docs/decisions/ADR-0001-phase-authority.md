# ADR-0001 — Phase authority (Roadmap over Playbook ordering)

- **Status:** Accepted
- **Date:** 2026-08-01

## Context

Aperture has a Development Roadmap (phases 0–12, version tags) and an Implementation Playbook (recommended build order and practices). Their phase sequences diverge in places (e.g. feature ordering later in the roadmap). Agents and contributors need a single rule when planning work.

## Decision

**Phase order and version tags follow the Development Roadmap.** The Implementation Playbook is a practice guide (Definition of Done, local workflows, quality habits), not the authority for which phase comes next.

Shipping cadence and locked stack defaults also follow the project plan / ADRs (e.g. hosting in ADR-0003).

## Alternatives considered

1. **Playbook wins** — rejected; Roadmap is the product rollout contract.
2. **Case-by-case** — rejected; too ambiguous for agents and reviews.

## Consequences

- Slice work is labeled with Roadmap phase ids (P0.1, P1.1, …).
- Playbook exit criteria (e.g. `docker compose up`) still apply as engineering bars inside those phases.
- If Roadmap and Playbook conflict on ordering, follow Roadmap and note the deviation in an ADR or docs update.

## Future evolution

Supersede this ADR only if the Roadmap itself is restructured by an explicit product decision.
