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

## Maintenance reminders (no CI to automate these — do periodically by hand)

| Check | Command | Cadence |
|---|---|---|
| Dependency vulnerabilities | `pnpm audit` | Before any dependency bump |
| Type safety | `pnpm exec tsc --noEmit` | Already enforced pre-commit; run manually after large refactors |
