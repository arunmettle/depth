# Goal 1: Scaffold Baseline

This goal freezes the repository shape before deeper feature work starts.

## Approved repository structure

- `web/`: Next.js + TypeScript + Tailwind + shadcn/ui foundation
- `engine/`: Go service for live market ingestion and alert evaluation
- `docs/`: product, architecture, and execution notes

## Why this shape

- One user-facing app
- One real-time backend service
- Minimal operational surface
- No monorepo layering unless the codebase proves it is needed

## Goal 1 acceptance bar

- Repository shape is explicit
- Web app scaffold exists and validates locally
- Engine ownership is documented
- Root docs reflect the agreed v1 scope
- No unnecessary packages, services, or folders are introduced

## Known constraint

The current machine does not have `Go` installed yet, so the engine folder is documented and reserved, but not compiled in this goal.
