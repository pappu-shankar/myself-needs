# Roadmap — Personal Life OS

Phased build plan. This file is a table of contents only — detail lives one-topic-per-file under `docs/roadmap/`. Status is updated here as work lands; each row is a checkpoint, not a granular task list (the granular list lives in the linked phase doc).

**Related:** [PRD.md](./PRD.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DESIGN.md](./DESIGN.md)

| Phase | Focus | Depends on | Status | Doc |
|---|---|---|---|---|
| 1 | Foundation — docs, scaffold, tooling, design system, unlock flow | — | Done | [docs/roadmap/phase-1-foundation.md](./docs/roadmap/phase-1-foundation.md) |
| 2 | Finance module (deep) | Phase 1 | Done — all 14 steps complete, incl. the insights engine (auditor/advocate/compliance) | [docs/roadmap/phase-2-finance.md](./docs/roadmap/phase-2-finance.md) |
| 3 | Health, Mental, Plans skeletons + Dashboard | Phase 1 | Done — Health and Plans deepened per user-confirmed scope; Mental kept at its Phase 1 skeleton, deferred by user choice | [docs/roadmap/phase-3-other-modules.md](./docs/roadmap/phase-3-other-modules.md) |
| 4 | Testing & hardening pass | Phases 2–3 | Done — 28 test files / 166 tests (service coverage + accessibility), full manual verification checklist passed | [docs/roadmap/phase-4-testing-hardening.md](./docs/roadmap/phase-4-testing-hardening.md) |
| 5 | Open-source release readiness (license, README, privacy disclosure, docs accuracy, UI copy pass) | Phase 4 | Done — LICENSE, README, PRIVACY.md, CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, and a full UI copy proofreading pass all landed | [docs/roadmap/phase-5-open-source-release.md](./docs/roadmap/phase-5-open-source-release.md) |
| 6 | Cross-module global search (Cmd/Ctrl+K palette) | Phase 4 | Done — built across 4 parallel background agents (one per module) plus a composition/UI layer | [docs/roadmap/phase-6-global-search.md](./docs/roadmap/phase-6-global-search.md) |
| 7 | Gym & training inside `health` (openGym parity + programming, recovery/analytics, body composition, camera rep counter) | Phase 3 | Done — built across 12 parallel agents plus a composition/integration layer; verified live | [docs/roadmap/phase-7-gym.md](./docs/roadmap/phase-7-gym.md) |
| 8 | Multi-user: per-user encrypted vaults, shared spaces, account registry, invites, sessions/devices, security log, admin area, internet-ready edge, Docker/Caddy deploy | Phase 4 | In progress — core (vaults, request scope, auth, spaces, edge, deploy) landed; sign-in/claim/admin/settings pages and the `requireUser` sweep still finishing | [docs/roadmap/phase-8-multi-user.md](./docs/roadmap/phase-8-multi-user.md) |
| 9 | Finance re-model — multi-entity, multi-currency, provenance-aware wealth OS (institutional portfolio depth, risk engine, what-if, document ingestion, AI planner) | Phase 2 | Phase 0 done (24 PRD docs rewritten, conventions updated); Phase 1 next, on a feature branch | [docs/roadmap/phase-9-finance-remodel.md](./docs/roadmap/phase-9-finance-remodel.md) |

## Maintenance reminders (no CI to automate these — do periodically by hand)

| Check | Command | Cadence |
|---|---|---|
| Dependency vulnerabilities | `pnpm audit` | Before any dependency bump |
| Type safety | `pnpm exec tsc --noEmit` | Already enforced pre-commit; run manually after large refactors |
