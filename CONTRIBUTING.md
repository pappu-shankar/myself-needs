# Contributing

This is a self-hosted, single-user app — see [`PRIVACY.md`](./PRIVACY.md) for what that means for how it's built. Contributions are welcome; this file covers what to know before opening a PR.

## Before you start

For anything beyond a small fix, open an issue first describing what you want to change and why. It saves rework if the approach needs discussion before code gets written.

## The rules that matter most

These aren't style preferences — violating them breaks the app in ways that are easy to miss locally and confusing to debug:

- **Modules never import from each other.** `src/modules/{finance,health,mental,plans,core}` each expose only their `index.ts`. Cross-module composition happens at the `src/app/` route layer, and cross-module references are a plain ID column, never a database foreign key. Full detail: [`docs/architecture/system-design.md`](./docs/architecture/system-design.md).
- **A `"use client"` component calling a Server Action must import it from `modules/<module>/actions.ts` (or `actions/*.ts`) directly** — never through the module's `index.ts` barrel. The barrel also carries service/query code that needs the native SQLite binding, which breaks the client bundle if it leaks in. The symptom is a generic build-manifest error, not an obvious import error, so this one is easy to hit by accident.
- **Never unlock or write to `data/app.db` during development.** That's a real user's real vault. Run `APP_DATA_DIR=data-dev pnpm dev` for any live/manual testing instead — see [`AGENTS.md`](./AGENTS.md).

## Setting up

```bash
pnpm install
APP_DATA_DIR=data-dev pnpm dev
```

## Before opening a PR

```bash
pnpm lint && pnpm exec tsc --noEmit && pnpm test
```

Pre-commit hooks run lint, typecheck, and affected tests automatically, but it's worth running the full set by hand before pushing. If you're adding a service function, add a test alongside it — see `src/test/db.ts` for the in-memory test-database harness every existing service test uses; no mocking needed.

## Where things live

| Looking for... | Go to |
|---|---|
| A module's DB schema | `src/modules/<module>/db/schema/` |
| A module's business logic | `src/modules/<module>/service/` |
| A module's Server Actions | `src/modules/<module>/actions/` |
| What a module is supposed to do | `docs/prd/<module>/` |
| Design tokens / shared components | `docs/design/` |
| Why a technical decision was made | `docs/architecture/` |

## Reporting a security issue

Don't open a public issue for a vulnerability — see [`SECURITY.md`](./SECURITY.md) instead.
