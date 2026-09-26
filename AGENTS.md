<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Personal Life OS — Agent Guide

Single-user, local-only personal life management app (finance/health/mental/plans/house) built as a modular monolith. Full detail lives in the docs below — this file is a map, not a copy.

- **Product requirements:** [PRD.md](./PRD.md)
- **Architecture (layering, module boundaries, security, performance):** [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Build plan / current status:** [ROADMAP.md](./ROADMAP.md)
- **Design system:** [DESIGN.md](./DESIGN.md)

## The one rule that matters most

Modules (`src/modules/finance`, `health`, `mental`, `plans`, `house`, `core`) **never import from each other**. Each module exposes only its `index.ts`. Cross-module composition happens at the `src/app/` route layer. Cross-module references are a plain ID column, never a schema-level foreign key. Full detail: [docs/architecture/system-design.md](./docs/architecture/system-design.md).

**Also:** a `"use client"` component calling a Server Action must import it from `modules/<module>/actions.ts` directly, never from the module's `index.ts` barrel — the barrel also carries plain service/query code that transitively needs the native SQLite binding, which breaks the client bundle. Symptom looks like a generic `ENOENT build-manifest.json` on first request, not an obvious import error. Same doc has the full explanation.

## Where things live

| Looking for... | Go to |
|---|---|
| A module's DB schema | `src/modules/<module>/db/schema/` |
| A module's business logic | `src/modules/<module>/service/` |
| A module's Server Actions | `src/modules/<module>/actions/` |
| What a module is supposed to do | `docs/prd/<module>/` |
| Design tokens / components | `docs/design/` |
| Why a technical decision was made | `docs/architecture/` |

## Parallelize independent work by default in auto mode

When a task splits into pieces that don't touch the same files and don't depend on each other's output (e.g. one unit of work per module, one per file batch), default to launching background sub-agents for those pieces in parallel rather than doing them serially — this is standing guidance, not something to re-ask permission for each time. Give each agent a self-contained scope (its own files, its own verification steps) so results merge cleanly with no coordination needed between agents. Work that's inherently sequential (an integration/composition layer that depends on the parallel pieces landing first, a single cohesive UI unit) still belongs to one thread, done after the parallel pieces complete — don't force-split work that doesn't actually decompose.

If a sub-agent call fails on a transient error (e.g. a session/rate limit), retry up to 5 times before falling back to doing that piece serially yourself.

## Subagent model tier

When spawning a subagent (Agent/Task tool or equivalent), pick the model tier and effort/reasoning level to fit what that specific subtask needs — don't just copy the main agent's tier.

- At or below the main agent's current tier: fine without asking. E.g. main agent is Opus — a copy-edit subtask can run on Haiku, a web-search subtask can run on Sonnet.
- Above the main agent's current tier: never escalate silently. E.g. main agent is Sonnet and a subtask would benefit from Opus — ask the user first (e.g. via AskUserQuestion) whether it's okay to use a higher model than the current one, and only escalate on a yes.
- Same rule for effort/reasoning level as for model tier.

## Communication

- Prefer short, direct updates over exhaustive narration. State what changed and what's next.
- When a design decision has real tradeoffs (e.g. today's AGENTS.md vs CLAUDE.md-only choice, or per-app vs shared current-feature), surface the tradeoff and ask rather than picking silently.

## Live/manual testing — never touch the real vault

This is a single-user app: `data/app.db` is the one real vault a real user's actual financial/health/mental/plans data lives in. Any live exploration (`pnpm dev` + a browser, Playwright, etc.) must run against an isolated data directory instead — set `APP_DATA_DIR=data-dev` (already gitignored, see `src/modules/core/env/paths.ts`) before starting the dev server, e.g. `APP_DATA_DIR=data-dev pnpm dev`. Never unlock or write to `data/app.db` for testing purposes. Automated tests already avoid this — the Vitest harness (`src/test/db.ts`) uses a fresh in-memory database per test, never touching disk at all.

**Running a verification server alongside a real dev session:** `next dev`'s single-instance lock lives under `distDir` and is keyed by project directory, not by port — so a second `next dev` for this repo refuses to start even on a different port while a real session (e.g. the user's own `pnpm dev` against `data/app.db`) is running. `next.config.ts` reads `NEXT_DIST_DIR` to point a one-off server at its own build/lock directory (`.next-verify`, already gitignored) so it can run concurrently without touching the other session: `APP_DATA_DIR=data-dev NEXT_DIST_DIR=.next-verify pnpm exec next dev -H 127.0.0.1 -p 3055`. Leave `NEXT_DIST_DIR` unset for normal use.

## Before committing

Pre-commit hooks (husky + lint-staged) run lint, typecheck, and affected tests automatically. If you're making a change by hand outside that flow, run `pnpm lint && pnpm exec tsc --noEmit && pnpm test` first.

