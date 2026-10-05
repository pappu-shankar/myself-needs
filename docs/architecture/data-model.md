# Data Model Conventions

Cross-cutting rules for how every module's schema/queries are structured. Table-by-table detail for finance lives in [../prd/finance/](../prd/finance/) alongside the feature it belongs to, not duplicated here.

**Related:** [system-design.md](./system-design.md) · [security.md](./security.md) · [../prd/finance/](../prd/finance/)

## Rules

| Rule | Why |
|---|---|
| One Drizzle schema file per table, named after the table | Predictable paths — an agent or you can guess the file before searching |
| Never store a value that's derivable from other rows (e.g. account balance, budget actual-spend) | Prevents drift between a stored number and the transactions that should back it |
| Money is always a pair: an integer `*_minor` amount plus its own `currency` column | Integer minor units keep SQL sums exact (a REAL column once turned 0.30 − 0.10 − 0.20 into −2.8e-17). The currency must sit beside the amount because the minor-unit exponent is a property of the currency, not the column — see below |
| Quantities that get multiplied by money (units, prices, rates, ownership stakes) are scaled integers, never floats | A float percentage or unit count reintroduces the drift integer money exists to remove, on the multiplier side |
| Every value-bearing row records where its value came from and how confident it is | Automatic, imported and hand-entered numbers are not equally trustworthy, and an aggregate that hides the difference overstates what is known |
| Every column used for filtering/sorting at scale gets an index | Data volume is expected to grow large (years of entries) — built in from day one |
| All list/table reads are paginated (`LIMIT`/cursor), never "fetch all, slice in JS" | Keeps memory/CPU bounded regardless of history size |
| Config that changes due to external policy (tax rates, allocation targets, scheme interest rates) lives in an editable table, never hardcoded | These values change over time (budgets, quarterly rate revisions) — one row edit, not a code change |
| One connection per open vault, held in a pool in `modules/core/db/client.ts` (guarded against re-open on dev hot-reload); services call `getDb()` and never pick a vault themselves | Avoids leaked SQLite handles; the request scope decides whose data a query sees |

## Money

Every monetary value is stored as `amount_minor` (an integer in the currency's smallest unit) plus a `currency` column alongside it. Application code does integer arithmetic in minor units and converts to a display string once, at the formatter, via `Intl.NumberFormat` — which already knows each currency's exponent.

**Why not a single money column type.** An earlier design used a Drizzle `customType` that multiplied rupees by 100 at the column boundary. A `customType` callback only ever receives its own column's value, so it cannot read a sibling `currency` to choose the exponent — and exponents differ (JPY 0, INR/USD/GBP/EUR 2, KWD 3). Keeping such a type and adding a currency column beside it is not a partial solution; it is silently wrong for every currency that is not 2-decimal.

**Summing.** SQL may sum freely *within* a currency, which is why currency is pinned at the account rather than the transaction — every leg on an account shares it, and balance computation stays one exact grouped sum. Anything grouping across accounts puts `currency` in the `GROUP BY` and returns per-currency subtotals. Conversion happens in TypeScript afterwards. **Never `SUM(amount * rate)`** — that is float arithmetic on money, the exact defect integer storage exists to prevent.

**Products that can overflow.** `units_scaled × price_scaled` exceeds 2^53 at realistic position sizes, so that multiplication happens in `BigInt` inside a single helper that returns a `number` of minor units. BigInt stays confined to that helper.

## Vaults: one database per user and per space

There is no `user_id` column. Every user has a personal vault (`data/users/<uuid>/app.db`) and every shared space has its own (`data/spaces/<uuid>/app.db`); each holds the full schema in `drizzle/` and is encrypted with its own key. Single-row settings tables are therefore naturally per user (or per space). Accounts, invites, sessions, the security log and space membership live in a separate plaintext registry, `data/accounts.db`, with its own tiny raw-SQL migration list versioned by `PRAGMA user_version` (not in `drizzle/`). Which vault a query hits is decided by the request scope, see [security.md](./security.md). Cross-module references remain plain ID columns inside one vault; nothing references across vaults. Details: [multi-user-contracts.md](./multi-user-contracts.md).

## Migrations

- `pnpm db:generate` (drizzle-kit) generates migrations into `/drizzle` at the repo root. Review the SQL before committing it.
- Migrations are applied **per vault, automatically when it is opened** (`openVault` in `src/modules/core/db/client.ts`) — a user's personal vault at sign-in, a space the first time it is opened — so an upgrade migrates each vault as its owner next signs in, over the already-authenticated encrypted connection. **Never run `drizzle-kit migrate` or `drizzle-kit push`** — the CLI can't open the encrypted file and would create or corrupt a plaintext one (see the note in `drizzle.config.ts`).
- Before applying any pending migration to an existing vault, the app copies that vault's encrypted `app.db` byte-for-byte to `<vault dir>/backups/app-<timestamp>-before-migration.db` (owner-only permissions; the newest 5 are kept). If a migration throws, or leaves new foreign-key violations, the backup is restored and the sign-in fails with a clear message — the vault is never left half-migrated.
- Foreign-key enforcement is switched off while migrations run (drizzle-kit's table-rebuild migrations need that, and SQLite ignores the `PRAGMA` inside the migrator's transaction) and re-verified with `PRAGMA foreign_key_check` afterwards.

## The "computed, not snapshotted" pattern

Recurring pattern across finance: account balances, budget actuals, and net worth are all computed via SQL aggregation over the transaction/cash-flow history at read time, not stored redundantly. If a specific aggregation ever becomes a real performance bottleneck at very large history sizes, a cached snapshot table can be added later **behind the same query function signature**, without changing any caller.

**Multi-currency makes this rule stronger, not weaker.** A stored net-worth figure freezes the exchange rate it was computed at. Historical rates get back-filled and corrected routinely, so a snapshot silently stops matching the rate it cites, and the number and its own stated basis drift apart. Totals that crossed a currency boundary therefore carry their conversion in the return type — the rate, its date and its source per contributing currency — rather than being stored.

Before reaching for a cache, batch: the net-worth trend's cost is per-month query fan-out, not FX, and set-based queries remove it without giving up any invariant. If a cache is still warranted afterwards, its key must include the FX rate table — omitting it is the subtle way such a cache goes stale invisibly.
