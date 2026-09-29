# System Design

Layering, module boundaries, and how modules reference each other.

**Related:** [data-model.md](./data-model.md) · [../../ARCHITECTURE.md](../../ARCHITECTURE.md) · [../prd/](../prd/)

## Request flow

Every module follows the same layering:

```
Browser (React Server + Client Components)
   ↓
app/<module>/page.tsx          — routing + composition only, no business logic
   ↓
modules/<module>/actions/      — Server Actions: parse input with Zod, call service layer
   ↓
modules/<module>/service/      — pure business logic (framework-agnostic, no Next.js imports)
   ↓
modules/<module>/db/schema/ + queries/  — Drizzle
   ↓
modules/core/db (Drizzle client) → data/app.db (encrypted SQLite)
```

| Layer | Responsibility | May import |
|---|---|---|
| `app/` | Routing, composition, layout | Any module's `index.ts` |
| `actions/` | Zod validation, thin adapter to `service/` | Own module's `service/`, `types.ts` |
| `service/` | Business logic, pure functions, no Next.js imports | Own module's `queries/`, `types.ts` |
| `db/queries/` | Drizzle query builders | Own module's `db/schema/`, `modules/core/db` |
| `db/schema/` | Drizzle table definitions | Nothing else in the app |

## Server Actions and pages: the enforced conventions

Every Server Action is built with `defineFormAction(schema, handler)` (or `defineAction` for programmatic calls) from `src/modules/core/action/define-action.ts`. The wrapper:

- requires an unlocked vault (`requireUnlocked`) before anything else runs;
- turns FormData into an object and validates it with the Zod schema (shared field types live in `src/lib/validation.ts`);
- runs the handler, then refreshes every page (`revalidatePath("/", "layout")`) — modules never hard-code app URLs;
- returns an `ActionState<T>` (`{ ok, error, fieldErrors, values, data }`, `src/modules/core/action/types.ts`) instead of throwing. Services throw `DomainError` (`src/modules/core/errors.ts`) for user-facing rule violations, which is shown verbatim; SQLite constraint errors get friendly messages; anything else is logged (never with row data) and replaced by a generic message.

Every protected `page.tsx` starts with `await requireUnlocked()` — a layout-level check is not a boundary in the App Router, because page segments render independently of their layout. API route handlers do the same.

"Today" is always `todayIso()` from `src/lib/dates.ts` (local calendar date), never `toISOString().slice(0, 10)` (the UTC date). Amounts and percentages are formatted with `src/lib/format.ts`.

These rules, plus the module-boundary rules below, are checked by `src/test/architecture.test.ts`, which runs with the rest of the suite on every commit.

## Module boundary rule

Modules never import from each other directly. Each module exposes a small public surface via its own `index.ts` (types + summary/read functions other layers need); everything else is private. Cross-module composition happens only at the `app/` route layer.

Example: `app/dashboard/page.tsx` calls `finance.getSummary()` and `mental.getLatestCheckIn()` — but `modules/finance` never imports from `modules/mental`.

## Cross-module references

A cross-module link (e.g. a finance investment linked to a goal in `plans`) is:

- A **plain ID column** (e.g. `linked_goal_id`) — no database-level foreign key into the other module's tables.
- **No schema/service import** across modules.
- Joined **in memory at the `app/` layer** — whatever page needs both sides fetches from each module's `index.ts` separately and composes them.

This is the one rule to follow for any future cross-module feature, not just the ones already planned.

## Client components must import Server Actions directly, not via `index.ts`

A `"use client"` component that needs a Server Action (e.g. a form calling `addMetricAction`) must import it straight from `modules/<module>/actions.ts` (or `actions/<file>.ts`), **never** from the module's `index.ts` barrel:

```ts
// ✅ correct
import { addMetricAction } from "@/modules/health/actions";

// ❌ breaks the build — index.ts also re-exports plain service/query functions
import { addMetricAction } from "@/modules/health";
```

`index.ts` re-exports both Server Actions (`"use server"`, safe for a client bundle — Next.js replaces them with an RPC stub) **and** plain service/query functions (server-only, transitively import the native SQLite binding). Importing anything from that barrel into a client component pulls the whole barrel into the client bundle graph, which fails to resolve the native module — surfacing as a confusing `Module not found` error (or, before that trace even shows up, as a generic `ENOENT ... build-manifest.json` on the very first request to the route, which is what makes this easy to misdiagnose as a dev-server/caching problem instead of an import-boundary one). Hit this exact failure while building the `health`/`mental`/`plans` skeletons — see `docs/roadmap/phase-1-foundation.md`.

## Why this gives extensibility

- **New module** = new folder under `modules/` + new route under `app/` + one nav entry. Existing modules untouched.
- **Backend → API-ready**: `service/` has zero Next.js-specific code. If this ever became a real API (e.g. a mobile client), `service/` moves into a route handler largely as-is; only `actions/` gets rewritten.
- **Database swap**: modules only touch Drizzle's query builder in `queries/`, never raw SQL scattered around. Swapping SQLite for Postgres later is a change to `modules/core/db`; schema files stay structurally similar.
- **Frontend**: shared UI lives in `components/ui`; module UI lives inside that module. No cross-leakage.
