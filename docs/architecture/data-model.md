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

- `pnpm db:generate` (drizzle-kit) generates migrations into `/drizzle` at the repo root. Review the SQL before committing it.
- Migrations are applied **automatically when the vault is unlocked** (`openDatabase` in `src/modules/core/db/client.ts`), over the already-authenticated encrypted connection. **Never run `drizzle-kit migrate` or `drizzle-kit push`** — the CLI can't open the encrypted file and would create or corrupt a plaintext one (see the note in `drizzle.config.ts`).
- Before applying any pending migration to an existing vault, the app copies the encrypted `app.db` byte-for-byte to `data/backups/app-<timestamp>-before-migration.db` (owner-only permissions; the newest 5 are kept). If a migration throws, or leaves new foreign-key violations, the backup is restored and the unlock fails with a clear message — the vault is never left half-migrated.
- Foreign-key enforcement is switched off while migrations run (drizzle-kit's table-rebuild migrations need that, and SQLite ignores the `PRAGMA` inside the migrator's transaction) and re-verified with `PRAGMA foreign_key_check` afterwards.

## The "computed, not snapshotted" pattern

Recurring pattern across finance: account balances, budget actuals, and net worth are all computed via SQL aggregation over the transaction/cash-flow history at read time, not stored redundantly. If a specific aggregation ever becomes a real performance bottleneck at very large history sizes, a cached snapshot table can be added later **behind the same query function signature**, without changing any caller.
