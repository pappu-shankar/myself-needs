# Data Model Conventions

Cross-cutting rules for how every module's schema/queries are structured. Table-by-table detail for finance lives in [../prd/finance/](../prd/finance/) alongside the feature it belongs to, not duplicated here.

**Related:** [system-design.md](./system-design.md) · [security.md](./security.md) · [../prd/finance/](../prd/finance/)

## Rules

| Rule | Why |
|---|---|
| One Drizzle schema file per table, named after the table | Predictable paths — an agent or you can guess the file before searching |
| Never store a value that's derivable from other rows (e.g. account balance, budget actual-spend) | Prevents drift between a stored number and the transactions that should back it |
| Every column used for filtering/sorting at scale gets an index | Data volume is expected to grow large (years of entries) — built in from day one |
| All list/table reads are paginated (`LIMIT`/cursor), never "fetch all, slice in JS" | Keeps memory/CPU bounded regardless of history size |
| Config that changes due to external policy (tax rates, allocation targets, scheme interest rates) lives in an editable table, never hardcoded | These values change over time (budgets, quarterly rate revisions) — one row edit, not a code change |
| A single Drizzle client instance (singleton) in `modules/core/db`, guarded against re-open on dev hot-reload | Avoids leaked SQLite handles during long dev sessions |

## Migrations

- `drizzle-kit` generates migrations into `/drizzle` at the repo root.
- Run migrations manually (`pnpm drizzle-kit migrate`) — no auto-migrate-on-boot, so a schema change is always a deliberate, reviewable step.

## The "computed, not snapshotted" pattern

Recurring pattern across finance: account balances, budget actuals, and net worth are all computed via SQL aggregation over the transaction/cash-flow history at read time, not stored redundantly. If a specific aggregation ever becomes a real performance bottleneck at very large history sizes, a cached snapshot table can be added later **behind the same query function signature**, without changing any caller.
