# Phase 1 — Foundation

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [phase-2-finance.md](./phase-2-finance.md)

| # | Task | Status |
|---|---|---|
| 1 | Write `docs/` tree + root index docs (`PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DESIGN.md`) + `AGENTS.md`/`CLAUDE.md` | Done |
| 2 | Scaffold Next.js (App Router, TypeScript `strict`, Tailwind) with pnpm | Done |
| 3 | Confirm `dev`/`start` bind to `127.0.0.1` only | Done |
| 4 | ESLint + Prettier + `eslint-plugin-jsx-a11y` | Done (jsx-a11y ships via `eslint-config-next`'s core-web-vitals) |
| 5 | husky + lint-staged (lint + typecheck + affected tests on commit) | Done |
| 6 | `design` skill mockups: dashboard + one finance list/table page | Skipped — built the design system directly in the app and verified visually via Playwright screenshots instead (light + dark), given the same person is designing and implementing |
| 7 | Design-system layer: `lib/tokens.ts` (via shadcn/ui tokens + a deliberate teal accent), `next/font` (Geist) w/ tabular numerals, `next-themes`, initial shared `components/ui` set (`PageHeader`, `FormField`, `Card`/`Table`/etc. from shadcn) | Done (initial set — `StatTile`, `DataTable`, `EmptyState`, `ChartCard` still to build when a module needs them) |
| 8 | Base layout/navigation across 4 modules + dashboard | Done (sidebar nav + protected layout shell; module pages themselves not yet built) |
| 9 | Drizzle ORM + `better-sqlite3-multiple-ciphers`; `modules/core/db` singleton | Done — encryption round-trip verified (correct key reads, wrong key rejected) |
| 10 | Unlock flow: passphrase → derive key → open encrypted db → session cookie | Done — verified end-to-end in a real browser (first-run creation, lock, wrong-passphrase rejection, re-unlock), light + dark mode |
| 11 | `health`, `mental`, `plans` thin skeletons (full layering, minimal fields) | Done — verified end-to-end in a real browser: add an entry in each module, dashboard reflects all three via cross-module composition, zero console errors |

## Notable implementation decisions not called out in the original plan

- **Key derivation**: passphrase → scrypt (with a random per-install salt) → raw 32-byte SQLCipher key, rather than passing the passphrase straight to SQLCipher's own KDF. See `src/modules/core/db/crypto.ts`.
- **Lock action**: added a "Lock" button (closes the db connection + destroys the session, forcing full passphrase re-entry) beyond what the plan specified — cheap to add, consistent with "ask every time" and gives a way to lock mid-session without restarting the process.
- **Native module packaging**: both `better-sqlite3-multiple-ciphers` and `better-sqlite3` itself must be installed and marked `serverExternalPackages` in `next.config.ts` — drizzle-orm's `better-sqlite3` driver hard-imports the literal `better-sqlite3` package name even though we pass it an already-connected `better-sqlite3-multiple-ciphers` instance. See `next.config.ts`.
- **Migrations**: `drizzle-kit`'s `migrate`/`push`/`pull`/`studio` CLI commands must never be pointed at `data/app.db` — they'd open it with a plain, non-SQLCipher connection. Only `drizzle-kit generate` (schema→SQL diffing, never touches the live db) is used from the CLI; migrations are applied programmatically via `drizzle-orm/better-sqlite3/migrator`'s `migrate()`, called from `openDatabase()` in `src/modules/core/db/client.ts` right after a successful unlock. See `drizzle.config.ts`.
- **Client components importing Server Actions**: found while building the `health`/`mental`/`plans` forms — a client component must import a Server Action from `modules/<module>/actions.ts` directly, never the module's `index.ts` barrel (which also re-exports plain service/query code that needs the native SQLite binding, breaking the client bundle). The failure mode is a generic `ENOENT ... build-manifest.json` on the route's first request — easy to misread as a dev-server caching bug rather than an import-boundary one. Full explanation: `docs/architecture/system-design.md`.
