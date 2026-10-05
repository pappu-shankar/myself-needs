# Phase 9 — Finance Re-model (Wealth OS)

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [../prd/finance/](../prd/finance/) · [phase-2-finance.md](./phase-2-finance.md) · [../architecture/finance-module-assessment.md](../architecture/finance-module-assessment.md)

**Status:** Phase 0 complete (tracking doc, PRD rewrite, architecture conventions). Phase 1 not started — it is cut as a feature branch, see Shipping.

## What this phase is

Phase 2 built finance as a **manual, single-currency, single-user INR tracker** and completed all 14 of its steps. This phase re-models it into a **multi-entity, multi-currency, provenance-aware wealth OS**: institutional-grade portfolio depth, a risk engine, what-if simulation, document ingestion, and a Level-3 AI planner.

This is not an extension of Phase 2. Four of the new foundations contradict constraints Phase 2 deliberately adopted (single currency, no import, no connected accounts, no notifications), so the storage layer is replaced underneath a layer of genuinely valuable, tested domain math that survives.

**Scale:** ~17–19k lines new or rewritten, against a current finance footprint of ~15.2k. Larger than the original finance build. Roughly 10–14 weeks of focused work; Phases 1–3 (~5–6 weeks) gate everything else.

**Reuse verdict** (measured, not estimated):

| Layer | Size today | Reuse |
|---|---|---|
| Platform/kernel (vault, auth, spaces, migration runner, design system, architecture tests) | ~88k repo-wide | ~100% |
| Finance computation layer (`src/modules/finance`, non-test) | 5,064 | ~55% |
| Finance tests | 3,704 | ~60% |
| Finance UI (`src/app/(protected)/finance`) | 6,610 | ~25% |
| New spec coverage with an existing counterpart | — | ~40% |

## How to use this document

Every step below starts at `Not started`. When a step lands, change its `Status` to `Done` **plus a note saying how it was verified** — not just "Done". Phase 2's step table is the model: its notes record the evidence ("verified live incl. the liability sign convention (credit card balance correctly nets a payment)"), which is what makes the work resumable by someone who wasn't there.

Update this file **in the same commit as the code**. A tracking doc updated in a separate pass drifts.

The decisions log at the bottom is not optional reading. Every entry records a *reason*. If a future session disagrees with a decision, the reason is what it has to argue with — a decision recorded without its reason gets silently reversed.

---

## Phase 0 — Tracking doc and PRD rewrite

Docs only. Safe to do on `main` while Phase 1's branch is open.

| # | Task | Doc | Status |
|---|---|---|---|
| 0.1 | This tracking doc + `ROADMAP.md` Phase 9 row | — | Done — doc created with the full step table and a 34-entry decisions log; Phase 9 row added to `ROADMAP.md` after Phase 8. Commit deferred: 614 unrelated files are staged from the in-flight Phase 8 work (see note at 0.1 in the log) |
| 0.2 | Rewrite `docs/prd/finance/` against the new spec | [../prd/finance/](../prd/finance/) | Done — 24 topic docs (10 rewritten, 14 new, 3 retired), written across 3 parallel agents over a shared vocabulary set by the 4 foundation docs; all cross-links verified to resolve and prettier clean |
| 0.3 | Retire `future-state.md` (all 6 open decisions now answered in the log below); mark `finance-module-assessment.md` superseded | [../architecture/finance-module-assessment.md](../architecture/finance-module-assessment.md) | Done — `future-state.md` deleted, its lifecycle table absorbed into `provenance-lifecycle.md`; assessment keeps its evidence behind a superseded banner |
| 0.4 | Update `PRD.md` global constraints and module status | [../../PRD.md](../../PRD.md) | Done — finance sub-domain index regrouped by IA area across all 24 docs; constraints rewritten (multi-currency, ingestion fallback chain, provenance, no third-party access, read-only re money); "no notifications" kept, as it is still true |
| 0.5 | Update `ARCHITECTURE.md` + `docs/architecture/data-model.md` (money conventions, derived-values rule and its FX caveat) | [../architecture/data-model.md](../architecture/data-model.md) | Done — `data-model.md` gained a Money section, 3 new convention rules and the FX caveat on the computed-not-snapshotted pattern; `ARCHITECTURE.md` needed no change (it carries no finance or currency specifics) |

## Phase 1 — Foundation: currency, entities, provenance, lifecycle

**Highest risk in the whole phase. Budget 3 weeks. Ships big-bang on a feature branch** (see Shipping). Nothing else is buildable until this lands.

Six sequenced migrations in one release. Order is load-bearing: entities before any `entity_id`; import batches before `import_batch_id`; the `finance_accounts` rebuild last so it rebuilds exactly once.

| # | Task | Status |
|---|---|---|
| 1.1 | Migration `finance_currency` — `base_currency` on settings; `currency` on the 6 money tables; `to_amount_minor`/`to_currency` on transactions + recurring rules; `finance_fx_rates(base, quote, date, rate_scaled, source)`; currency on tax-settings/slabs and `plans_goals` | Not started |
| 1.2 | Migration `finance_units_scaling` — `units_scaled` (1e6), `price_scaled`, `price_currency`; rebuild of holdings + valuations | Not started |
| 1.3 | Migration `finance_entities` — entities / `entity_stakes` (integer basis points, dated) / institutions; seed `Self`; nullable `entity_id`/`institution_id` + backfill; `liquidity`, `kind`, `normal_balance` | Not started |
| 1.4 | Migration `finance_provenance` — `source`, `method`, `confidence`, `as_of`, `import_batch_id`, `external_ref` as inline columns; import-batch tables | Not started |
| 1.5 | Migration `finance_lifecycle` — `voided_at`, `void_reason`, `superseded_by_id`, `updated_at` on the two ledger tables; `archived_at` on accounts/holdings/policies/entities | Not started |
| 1.6 | Migration `finance_loan_terms` — create `finance_loan_terms`/`finance_credit_terms`, `INSERT … SELECT`, then drop the 5 per-type columns from `finance_accounts`. **Must be last.** | Not started |
| 1.7 | Retire `db/schema/money.ts`; introduce `(amount_minor, currency)` pairs and a `formatMoney({ minor, currency })` in `src/lib/format.ts`; delete the 11 copy-pasted local `formatAmount` helpers | Not started |
| 1.8 | Convert the ~46 call sites that assume rupee floats: 8 schema files, 9 query files (incl. the 4 `.mapWith(paiseToRupees)` raw-SQL sums), and the services that legitimately produce float money (`investments.ts` accrual, `loans.ts`, `returns.ts`) | Not started |
| 1.9 | `valueOfUnits()` helper doing the one `units_scaled × price_scaled` multiply in `BigInt` (overflows 2^53 at realistic position sizes); BigInt never leaves the helper | Not started |
| 1.10 | Reconciliation queue for what cannot be migrated: foreign-currency holdings, entity attribution, account/holding institution, pre-first-rate FX, valuation provenance | Not started |
| 1.11 | The 5 migration tests (see Verification) — the gate on merging the branch | Not started |

## Phase 2 — Record lifecycle and provenance surfaces

Fixes what `finance-module-assessment.md` calls "the strongest day-to-day usability gap": finance is create-and-read only today, so correcting a wrong row needs DB surgery.

| # | Task | Status |
|---|---|---|
| 2.1 | Full CRUD + void/archive across all 12 action files (710 lines, currently create-only — the sole delete in finance is `deleteTaxSlabAction`) | Not started |
| 2.2 | Void honoured in **both legs** of the UNION ALL in `db/queries/domain/accounts.ts`, plus every other query that touches money | Not started |
| 2.3 | Correction trail UI: a voided row and its replacement are both visible, with the reason | Not started |
| 2.4 | Provenance + staleness badge on every displayed value; confidence mix on every aggregate | Not started |

## Phase 3 — Information architecture (Option 5)

| # | Task | Status |
|---|---|---|
| 3.1 | Single IA config replacing the 5 hand-synced sources (`nav-config.ts`, `breadcrumbs.tsx` `SEGMENT_LABELS`, `finance/page.tsx` `NAV_ITEMS`, 3 sub-hub `NavCard` lists, per-page "Back to…" buttons) | Not started |
| 3.2 | `finance/layout.tsx` with section nav — finance has **no layout at all** today; MONEY/WEALTH/DEBT/GOALS/TAX/INTELLIGENCE are nested, not new top-level tabs | Not started |
| 3.3 | `finance_goals` table for financial goals; life goals stay in `plans` with a soft pointer | Not started |
| 3.4 | Home as command center: overview + prioritised alerts + quick actions, not a dashboard | Not started |

## Phase 4 — Ingestion: statements and documents

| # | Task | Status |
|---|---|---|
| 4.1 | CSV statement import reusing `src/modules/health/importers/{csv,detect,name-match}.ts` and the gym import UI harness (chunked, resumable, review-before-commit) | Not started |
| 4.2 | PDF/document extraction via LLM, incl. password-protected statements | Not started |
| 4.3 | Transfer detection — pair the two legs of an internal movement so it stops counting as spending | Not started |
| 4.4 | Auto-categorization with user-editable categories and learned overrides | Not started |
| 4.5 | Recurring **detection** from transaction history (Phase 2 only generates from declared rules) | Not started |

## Phase 5 — Wealth analytics

| # | Task | Status |
|---|---|---|
| 5.1 | Multi-definition net worth: total / liquid / investable / financial / household / business-adjusted, with per-currency subtotals and ownership proration | Not started |
| 5.2 | Wealth history + attribution (income / investment gain / property gain / debt reduction / spending / tax) | Not started |
| 5.3 | Three-way cash flow: operating / investing / financing | Not started |
| 5.4 | Multi-dimensional allocation (asset class × geography × currency × sector × market cap × liquidity), replacing the 4-bucket `COARSE_MAP` | Not started |
| 5.5 | Unit-based FIFO lot matching, replacing the amount-based version that structurally cannot produce a capital loss | Not started |
| 5.6 | Net-worth query batching — `getNetWorthTrend(12)` currently issues `1 + 12×(3+2N)` queries (~757 and 24 full table scans at 30 holdings). Three set-based queries replace them | Not started |

## Phase 6 — Risk engine, goals, what-if

| # | Task | Status |
|---|---|---|
| 6.1 | Six risk dimensions + composite score: market, liquidity, debt, concentration, currency, goal | Not started |
| 6.2 | Goal priority, required funding, deadline | Not started |
| 6.3 | Monte Carlo goal success probability (10k closed-form paths, visible editable return mean/vol) | Not started |
| 6.4 | What-if scenarios — bounded to "what does this decision do to this goal" | Not started |

## Phase 7 — Intelligence: AI planner and alert center

| # | Task | Status |
|---|---|---|
| 7.1 | Alert Center: extend the existing 15-rule insights engine to 4 severities + configurable thresholds, computed on read | Not started |
| 7.2 | Anthropic SDK + prompt layer working from derived aggregates, not raw ledger rows | Not started |
| 7.3 | Level-3 planner with explainability: rationale, assumptions, risks, alternatives, assumption sensitivity | Not started |
| 7.4 | Eval suite for the planner — an LLM feature without one is untestable | Not started |

## Phase 8 — Reference data, jobs, export

| # | Task | Status |
|---|---|---|
| 8.1 | **Spike first:** market-data licensing and pricing for NSE/BSE + US + LSE/EU equity. Most free tiers forbid commercial use. ~1 day | Not started |
| 8.2 | Shared plaintext reference DB alongside `data/accounts.db` (FX, NAV, equity, metals, indices) — needs no vault key | Not started |
| 8.3 | First background job runner in the repo (none exists: `fashion_generation_jobs` is advanced by its own polling read; `pruneAudit`/`pruneSessions` run opportunistically on write) | Not started |
| 8.4 | FX via the ECB daily reference series (public domain, EUR pivot, covers USD/GBP/INR); additional `PriceProvider` implementations | Not started |
| 8.5 | Full data export — CSV / JSON / XLSX / PDF, modelled on `src/modules/health/importers/backup.ts` | Not started |

---

## Decisions log

Every entry records the reason. Argue with the reason, not the conclusion.

### Access and privacy

1. **Keep the existing vault architecture unchanged — no key escrow, no multi-tenant rewrite.** Requirement is simply: user 1 logs in and sees their own data, user 2 sees theirs. That is already built, tested and enforced by `src/test/architecture.test.ts`. Escrow was considered and rejected once cross-vault household rollup left scope — it would have cost a KMS dependency, a narrowed architecture test, corrections to five docs that promise admins cannot read user data, and the most privacy-sensitive code path in the design. For an HNI/UHNI product, "we cannot read your finances" is also the stronger position.
2. **No third-party professional access — auditor, lawyer, CA, tax advisor, planner, wealth manager.** Explicitly declined twice by the user. Future shape, when wanted: a scoped, time-boxed, revocable consent grant logged to the audit trail, built on the existing `spaces` sealed-key sharing. Nothing in Phases 1–8 blocks it.
3. **Alerts and risk scores compute on read, not on a schedule.** No vault key exists server-side while a user is signed out. `PRD.md:44` already promises "surfaces when you open the app", and for a wealth product reviewed periodically rather than minute-to-minute that is correct behaviour, not a limitation.
4. **Market and reference data lives in the clear.** FX, NAVs, equity, metals and indices are not personal data. There is no reason to decrypt N vaults to record today's gold price; the per-user join happens at read time.

### Data model

5. **`db/schema/money.ts` is retired in favour of explicit `(amount_minor INTEGER, currency TEXT)` pairs.** A Drizzle `customType` callback receives only its own column's value, so it cannot read a sibling `currency` to choose the minor-unit exponent. With JPY at 0, INR/USD at 2 and KWD at 3, no per-column codec can be correct. "Keep `money`, add a currency column" is not a working option — it is silently wrong for every non-2-exponent row.
6. **Currency is pinned at the account, not the transaction.** This keeps `transactionDeltasByAccount` a single exact-integer grouped sum, and that function is the hot path for balances, net worth, allocation and the emergency fund. It is the highest-leverage modelling decision in the phase.
7. **Cross-currency transfers carry both legs on the row** (`amount_minor`/`currency` + `to_amount_minor`/`to_currency`). The historical rate is then implied by the two legs and never needs an FX lookup — the truth is what the bank actually did.
8. **Never `SUM(amount * rate)` in SQL.** Add `currency` to existing GROUP BYs, return per-currency subtotals, convert in TypeScript. Float arithmetic on money is precisely the bug migration 0023 was written to kill, and "latest rate on or before date" is a correlated subquery per row anyway.
9. **Base currency is a read-time display setting, never written into rows.** Rows keep their original currency permanently, so switching base INR→USD re-converts at read time and no historical number moves. Storing base into rows is the silent-corruption trap here.
10. **One `finance_accounts` table with a `kind` discriminator, not a split into account/liability tables.** A real split forces either polymorphic `(account_id, kind)` with no FK — which forfeits `PRAGMA foreign_key_check`, the entire safety net in `applyMigrations` — or re-pointing every historical transaction into a new id space. Type-specific attributes move to 1:1 satellites (`finance_loan_terms`, `finance_credit_terms`) instead.
11. **The negative-balance liability convention survives.** The sign is baked into every historical transaction, into `getAccountsTotal`'s single-pass sum, and into the allocation and insight rules. Flipping it is a data mutation with no safe inverse. Instead, stop *inferring* sign from `type`: add `normal_balance ('debit'|'credit')`, backfilled from today's `LIABILITY_TYPES`, with `CHECK ((kind='liability') = (normal_balance='credit'))`.
12. **Ownership is integer basis points, dated** (`entity_stakes.ownership_bps` with `effective_from`/`effective_to`), never a REAL percentage — a 70% stake changes over time and must be recorded, not overwritten.
13. **Consolidation order: sum per (entity, currency) → prorate by `ownership_bps` → convert at the as-of rate → sum.** Converting before prorating double-rounds.
14. **Units and prices become scaled integers** (`units_scaled` at 1e6, `price_scaled`, plus `price_currency`). Today holding value is integer-exact units × float price, so cash is exact while investments are float-derived. The `units_scaled × price_scaled` product overflows 2^53 at realistic sizes (1e4 units × ₹5,000 → ~5e19), so that one multiply happens in `BigInt` inside `valueOfUnits()` and BigInt never escapes it.
15. **Statutory tax amounts convert to INR, not to the user's base currency.** `finance_tax_settings` limits/exemptions and `finance_tax_slabs.upto_amount` are statutory rupee figures that migration 0023 missed and that are still `real`. This is a different conversion target from net worth and is easy to get wrong.
16. **No stored derived values, still — and FX does not change that.** A net-worth snapshot would freeze the conversion rate, so back-filling a missing historical rate (guaranteed to happen) would silently fail to update the trend while the UI still cites that rate. Conversion is made auditable in the return type instead: `{ month, baseMinor, baseCurrency, byCurrency: [{ currency, minor, rate, rateDate, rateSource }], stale }`. If performance demands it, batch first (757 queries → ~5); only then cache, and the cache key must include `finance_fx_rates`.

### Lifecycle and provenance

17. **Ledger rows are immutable with void/reversal; descriptive rows are edit-in-place with archive.** Transactions and investment cash flows get `voided_at`/`void_reason`/`superseded_by_id`, so a correction is a new row pointing at the voided one and reported returns never change silently. Accounts, holdings, policies, categories, entities and institutions are editable with `archived_at`, and deletion is refused when history references them. Valuations are dated replacements retaining revisions. Budgets already do new-effective-period correctly. Net effect: `superseded_by_id` goes on two tables, not everywhere.
18. **Provenance enums:** `source {user, import, connector, market, computed}` · `method {manual, statement_import, document_extract, api_quote, accrual, user_estimate, unknown}` · `confidence {verified, reported, estimated, unknown}`. `unknown` exists specifically so the Phase 1 migration never fabricates provenance for pre-existing rows — "Refresh NAV" valuations are indistinguishable from hand-typed ones in current data.
19. **Confidence propagates by weakest-link plus a mix.** A computed aggregate inherits the weakest confidence among its contributors *and* reports the mix by value ("₹4.2 Cr — 71% verified, 29% estimated"). This is an algorithm, not a column; every aggregate return type carries it.
20. **Provenance columns are inline, not a polymorphic side table.** A polymorphic row reference cannot carry a foreign key, which again forfeits the `foreign_key_check` gate.

### Scope

21. **Household wealth is an entity rollup inside one vault, not linked logins.** A rollup across two accounts means user 1 reading user 2's numbers, which decision 1 rules out. Entities deliver the same consolidated picture with zero cross-user access, and for HNI/UHNI it matches practice — one person or a family office maintains the consolidated view while individuals keep their own logins for their own tracking. State plainly in the PRD: entities are *your record* of family and business wealth, not accounts those people log into, and nothing syncs between the two.
22. **Goal success probability uses light Monte Carlo** (10k closed-form paths, milliseconds in JS) because a probability is a distributional claim a deterministic projection cannot honestly produce. Everything else stays deterministic with sensitivity bands. This stays inside the no-long-term-forecasting boundary: it answers "will this goal be met", not "what is my net worth in 2035".
23. **Behavioral risk is dropped from the risk engine — six dimensions, not seven.** "Overtrading / panic selling" needs trade-timing history the app will never hold. A score computed from absent data is worse than no score; say so in the UI rather than faking it.
24. **AI planner keeps explainability.** A Level-3 planner that cannot show its reasoning is a black box issuing financial advice. Hard boundary: analysis and personalized planning, never "buy XYZ", never execution.
25. **Tax is analysis only — no ITR preparation or e-filing.** Projections, STCG/LTCG, loss harvesting, 80C/80D, regime comparison and "what tax if I sell these" are all in. Filing carries annual form-version maintenance and an accuracy liability the rest of the app does not carry.
26. **Launch currencies INR, USD, GBP, EUR; markets India + US/UK/EU.** FX is free and licence-clean via the ECB daily series (public domain, EUR pivot, covers all four). Equity across those exchanges likely needs a paid feed — procurement, not code. Note `api.mfapi.in`, the one existing integration, is an unofficial AMFI scraper: fine personally, shaky commercially.

### Deferred to future enhancements

27. Account Aggregator / bank and broker connections — needs an RBI-regulated AA licence or a TSP partnership, company KYC and hosted callbacks. The ingestion fallback chain (auto → connector → file → manual) stays the stated architecture, and Phase 4's provenance + `import_batch_id` are the seam a connector plugs into, so nothing built now blocks it.
28. Monetization, B2B, commissions, referrals. Product decision; no code until there are users.
29. Linked household logins; full role-based access; advisor/CA collaboration; portfolio benchmarking; trusts, holding companies, estate and succession planning; multi-country tax engines. The `finance_entities` + `entity_stakes` shape is deliberately built to accept the HNI/family-office set without a second migration.
30. Generic long-term net-worth forecasting — explicitly declined, and that is what keeps Phase 6 bounded.
31. Full multi-tenant database migration — nothing in this spec needs it; revisit only on real load.

### Process

32. **Phase 1 ships big-bang on a feature branch**, not behind a compatibility shim. It changes how every money value is stored and displayed, so finance breaks all at once; production stays on current code until the branch is green. **Do not touch finance on `main` while the branch is open** — anything under `src/modules/finance` or `src/app/(protected)/finance` will conflict across dozens of files. Phases 2–8 are ordinary incremental work on `main`.
33. **No down-migrations; `BACKUPS_TO_KEEP` stays at 5.** Reverse SQL for table rebuilds is itself error-prone and would roughly double Phase 1's migration work. Accepted risk, stated plainly: five failed sign-in attempts each take a fresh pre-migration backup and can evict genuinely older restore points. What makes this acceptable is the pre-merge rehearsal against a copy of real data — it moves discovery of a bad migration to before the merge, where the only data at stake is a throwaway copy.
34. **Phases 4–8 in this document are sketches, not specs.** Phase 4 (document ingestion with LLM extraction) and Phase 7 (the AI planner) are each a multi-week subsystem described in a few rows. Each needs its own planning pass when reached. Do not treat these rows as sufficient specification.

### Added during the Phase 0 PRD rewrite

35. **`derived` added to the provenance `method` enum.** The original seven values had no home for a value the app computed rather than observed — a government-scheme balance rolled forward from its contribution ledger, or a net-invested fallback for an instrument with no market price. `accrual` is specifically interest compounding at a known rate, so these were landing on `unknown` and losing a real distinction. `derived` always pairs with `confidence: estimated`.
36. **Four net-worth scopes made explicit:** Total (everything `Self` owns, unprorated — the headline figure), Individual (one named entity alone), Household (personal/joint/family entities, prorated), Business-adjusted (household plus the prorated business and trust share, flagged illiquid). Household and business-adjusted differ only by whether businesses and trusts are included, and are kept apart because a family's spendable position and its total economic exposure are different questions — conflating them is how an illiquid company stake ends up reading like money in the bank.
37. **`revolving_credit` account type added, and APR moved onto `finance_credit_terms`.** The universal loan engine requires line of credit, overdraft, BNPL and margin loan, and none of them fit `loan` (no amortization schedule) or `credit_card`. They take credit terms rather than loan terms. Loan and credit rates are stored as integer basis points throughout, for the same reason ownership stakes are.
38. **Liquidity class applies to holdings as well as accounts**, defaulted from holding type. Without it an illiquid private holding is indistinguishable from a listed one in every liquidity-aware figure.
39. **`linked_goal_id` becomes a real foreign key.** It was a plain ID with no FK only because goals lived in another module; `finance_goals` is in the same module, so the constraint is now available and the migration's `foreign_key_check` gate can enforce it.
40. **Emergency-fund coverage lives in cash flow**, and must always state both halves of its ratio — the `liquid` class only, and a trailing three *complete* months of expense, so a reading taken on the 2nd is not distorted by two days of data.

## Open questions

Not blockers for Phases 1–3, but each needs an answer before the phase that depends on it.

| # | Question | Blocks |
|---|---|---|
| A | **Does financial data leave the vault to reach an LLM, and under what consent?** Both document extraction (Phase 4) and the planner (Phase 7) send user financial content to a model provider. That sits against the product's stated position that nobody but the account holder sees their finances. Needs an explicit decision on scope (raw statement text vs derived aggregates), opt-in, and provider. | Phases 4, 7 |
| B | **Where do sector, country, market-cap band and fund underlying holdings come from?** Needed for multi-dimensional allocation and fund-overlap detection. Currently specified as user-editable with no source. The ECB FX series does not cover it and no equity reference feed is chosen. | Phase 5 |
| C | **Where does the CPI series for inflation-adjusted returns come from?** Same gap — not covered by the planned reference data. | Phase 5 |
| D | **Does Home run the full rule engine on every open?** Alerts compute on read and Home shows prioritised alerts, which is consistent but means the whole snapshot is composed on every visit. May need a bounded subset or a per-request memo. | Phase 3 |
| E | **Are risk composite weights user-editable, and is the goal funding order fixed?** Currently written as editable weights and "essential, then important, then lifestyle, earliest date first". Reasonable defaults, not decided. | Phase 6 |

---

## Verification

Per step: `pnpm verify` (lint + typecheck + tests + `next build`). Pre-commit hooks already run typecheck and the full suite on staged files.

### The Phase 1 migration gate

Five tests on the pattern established by `src/modules/finance/db/money-migration.test.ts` — copy `drizzle/`, truncate `meta/_journal.json` to the pre-migration tag, migrate, seed old-shape rows with raw SQL, FKs off, run the full journal, FKs on, then assert through the real query functions.

1. **Currency confidence** — seed one `intl_equity` and one `equity` holding; assert the international row lands in the reconciliation queue and the domestic one does not. The assertion is that the migration *refuses to be confident*, which is the only thing a test can assert here.
2. **Void in both legs** — void a transfer; assert both account balances return to their pre-transfer values and the month's net-worth point is unchanged. Plus a total-recall guard: with every row voided, every exported query in `db/queries/domain/*` returns 0. That catches the filters you forgot, not just the two you thought of.
3. **Loan terms survive the rebuild** — all four loan fields plus the card limit copied into the satellites, `foreign_key_check` empty, and the amortization schedule identical to the pre-migration one. Migration 0023 proves the rebuild idiom inserts a column subset *without erroring*, so this fails silently if untested.
4. **Units/price scaling** — adversarial pairs (`0.1`, `1234.5678`, `1e7` units; `0.0001`, `99999.99` prices) within 1 minor unit of hand-computed values, and the `1e7` case exact (the double-multiply path would not be).
5. **No sign-in wedge** — run the full journal three ways: empty new vault (the **no-backup** path, since `client.ts:257` only backs up when `applied > 0`), populated vault, and seeding re-run twice for idempotency. Run the empty case under `foreign_keys = ON` as well, mirroring `src/test/db.ts`, so the pragma divergence fails in CI rather than in every other test file.

**Verified trap worth repeating:** `src/test/db.ts:10` sets `foreign_keys = ON` *before* `migrate()`, while production sets it OFF inside `applyMigrations`. An `ADD COLUMN … NOT NULL DEFAULT … REFERENCES` would therefore pass in production and **fail the entire existing test suite**. Use a nullable FK plus a backfill UPDATE.

### Other gates

- **Entity rollup** — a vault with self + spouse + a business held at 70%: individual net worth is the `self` entity alone, household is the full rollup, the business contributes exactly 70% of its net (prorated after summing, not before), and a dated stake change is honoured at the right as-of date.
- **New architecture-test invariants**, grep-shaped like the existing ones in `src/test/architecture.test.ts`: no money value formatted without a currency; no SQL `SUM` over a money column without `currency` in the `GROUP BY`; no aggregate return type lacking a `confidence` field. Three whole bug classes caught at review time instead of in production.
- **Live check** — `APP_DATA_DIR=data-dev NEXT_DIST_DIR=.next-verify pnpm exec next dev -H 127.0.0.1 -p 3055`, then walk the new IA and one full correct-a-mistake journey. Never against `data/`.
- **Pre-merge rehearsal against a copy of real data** — the highest-value check in Phase 1. `cp -a data data-rehearsal`, point `APP_DATA_DIR` at the copy, sign in to force the migration batch, walk the finance screens. Never against `data/` itself.
