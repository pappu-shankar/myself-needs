# Working with AI Coding Agents on This Repo

**Related:** [../../AGENTS.md](../../AGENTS.md) · [system-design.md](./system-design.md)

This repo is set up so Claude Code, Codex, or any other AI coding agent (and you) can pick it up cold and work effectively.

## Code-level conventions

- **Small, single-concern files** — the `schema/`, `queries/`, `service/`, `actions/` split per module means an agent working on e.g. "loan amortization" only needs `service/loans.ts` plus its schema counterpart, not a giant `finance.ts`.
- **Strict TypeScript** (`strict: true`, no `any`) and **Zod at every boundary** — the clearest signal an agent has about what's actually allowed.
- **Predictable naming** — one file per Drizzle table named after the table; one service file per concern named after what it does.
- **Vitest coverage on the service layer** — a fast way for any agent to verify a change didn't break existing behavior before handing it back to you.

## Documentation conventions

- Four root docs (`PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DESIGN.md`) are tables of contents — tables, not prose — pointing into `docs/<name>/` for one-topic-per-file detail.
- Every chunk file opens with a one-line purpose and a **Related:** line linking to what it depends on / is depended on by.
- `AGENTS.md`/`CLAUDE.md` never duplicate detail — they're a short map into `docs/`. `CLAUDE.md` is literally `@AGENTS.md` (Claude Code's file-import syntax) so there is exactly one copy of the agent-facing overview.

## Before committing

Pre-commit hooks (husky + lint-staged) run lint, typecheck, and affected tests. If bypassing that flow for any reason, run manually: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`.
