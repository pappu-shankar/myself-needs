# Architecture — Personal Life OS

System design index. This file is a table of contents only — detail lives one-topic-per-file under `docs/architecture/`.

**Related:** [PRD.md](./PRD.md) · [ROADMAP.md](./ROADMAP.md) · [DESIGN.md](./DESIGN.md)

## Contents

| Concern | Doc |
|---|---|
| Layering, module boundaries, cross-module references | [docs/architecture/system-design.md](./docs/architecture/system-design.md) |
| Data model conventions (schema/queries structure, migrations, indexing) | [docs/architecture/data-model.md](./docs/architecture/data-model.md) |
| Security (unlock flow, encryption at rest, localhost binding) | [docs/architecture/security.md](./docs/architecture/security.md) |
| Rendering, theming & performance | [docs/architecture/performance.md](./docs/architecture/performance.md) |
| Working with AI coding agents on this repo | [docs/architecture/ai-agents.md](./docs/architecture/ai-agents.md) |

## Tech stack at a glance

| Concern | Choice |
|---|---|
| Language/runtime | TypeScript on Node.js |
| Framework | Next.js (App Router) |
| Styling/UI | Tailwind CSS + shadcn/ui (Base UI primitives) |
| Charts | Recharts |
| Database | SQLite via `better-sqlite3-multiple-ciphers` (encrypted at rest) |
| ORM | Drizzle ORM + drizzle-kit |
| Validation | Zod |
| Tables | TanStack Table + TanStack Virtual (server data arrives via Server Components; no client data-fetching library) |
| Animation | CSS transitions (Tailwind + tw-animate-css), always gated on `prefers-reduced-motion` |
| Returns math | `xirr` (npm) + hand-written CAGR/IRR/SIP/Lumpsum/inflation formulas |
| Testing | Vitest + Testing Library + vitest-axe |
| Package manager | pnpm |

Full rationale for each choice: see the original planning conversation, ported into the docs above.
