# Aperture Documentation

## Purpose

This directory contains all engineering, architecture, and design documentation for Aperture.

These documents evolve alongside the implementation and are the authoritative source for architectural intent, engineering standards, and product direction.

## Reading Order

1. Aperture PRD
2. Aperture Development Roadmap
3. Architecture Documents
4. Design Documents
5. Engineering Documents

Architecture Decision Records (ADRs) and the Design System evolve during development.

## Structure

```text
docs/
├── Aperture PRD.pdf
├── Aperture Development Roadmap.pdf
├── README.md
├── 01-architecture/
├── 02-design/
├── 03-engineering/
├── 04-decisions/
├── 05-design-system/
└── assets/
```

## Folder Responsibilities

### Root Documents
**Aperture PRD** — Defines the product vision, goals, audience, branding, and feature overview.

**Development Roadmap** — Defines implementation phases, milestones, and feature rollout.

### 01-architecture
Owns the high-level architecture:
- System Architecture
- Technical Architecture
- Backend Architecture
- Frontend Architecture

### 02-design
Owns the engineering blueprint:
- Domain Model
- Low-Level Design
- Database Design
- API Specification

### 03-engineering
Owns engineering workflows:
- Implementation Playbook
- Testing Strategy
- CI/CD & DevOps Guide

### 04-decisions
Stores Architecture Decision Records explaining **why** important technical decisions were made.

### 05-design-system
Documents Aperture's visual language and reusable UI patterns after they stabilize.

### assets
Stores reusable diagrams, screenshots, branding assets, and other documentation resources.

## Documentation Principles

- Every document has one responsibility.
- Avoid duplicate information.
- Architecture explains structure.
- Design explains implementation concepts.
- Engineering explains development and operations.
- ADRs explain *why* decisions were made.
- Design System explains visual consistency.

## AI Agent Instructions

1. Read the PRD before implementing features.
2. Use the Development Roadmap to determine the current phase.
3. Update the appropriate architecture/design document when structural changes occur.
4. Create ADRs only after significant engineering decisions.
5. Update the Design System only when reusable UI patterns have stabilized.
6. If documentation conflicts with implementation, treat the implementation as the source of truth, update the documentation, and create an ADR if the architectural decision has changed.
