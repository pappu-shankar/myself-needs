# Phase 4 — Testing & Hardening

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [../architecture/security.md](../architecture/security.md)

| # | Task | Status |
|---|---|---|
| 1 | Vitest: one test per module's service function | Done — 24 service test files across finance (accounts, categories, transactions, budgets, insurance, scheme-templates, loans, recurring, investments, returns, net-worth, reports, allocation, tax, and the full insights engine), health (metrics, symptoms, medications), mental, and plans |
| 2 | `vitest-axe` accessibility check per core page (unlock, dashboard, finance) | Done — 3 test files (empty-state + populated-state per page); zero violations |
| 3 | Full verification pass — see checklist below | Done — every item checked live |

**Totals:** 27 test files, 153 tests, all passing; `pnpm exec tsc --noEmit` and `pnpm lint` both clean.

## Verification checklist

- [x] `pnpm dev` runs on localhost; unlock screen appears first, then dashboard.
- [x] Create one record in each module, restart the dev server, confirm it persists (encrypted sqlite durability + passphrase re-open) — verified live: dashboard summary figures (total balance, latest health metric, active goals) matched exactly before and after a full server restart + re-unlock.
- [x] Finance: account + budget + recurring worklist + investment + net worth all reflect correctly together.
- [x] Mutual fund "Refresh NAV" fetches a real NAV.
- [x] XIRR/CAGR/SIP/EMI cross-checked against known values (real holding + calculator page, and now hand-verified in `returns.test.ts`).
- [x] Loan amortization schedule sums to the EMI each month, reaches zero at stated tenure; credit utilization % correct (hand-verified in `loans.test.ts`, including the "EMI never covers interest" edge case).
- [x] FIFO capital gains matching + LTCG/STCG classification correct on a purchase+partial-redemption scenario (hand-verified in `tax.test.ts`: a two-holding, two-lot-age scenario produces exact 150000/20000 LTCG/STCG figures and exact post-exemption tax).
- [x] Goal-linked investment: `finance` and `plans` modules never import each other — grep-verified across all four deep modules, zero cross-module imports found anywhere.
- [x] One insight triggered per category (audit/advocate/compliance), shown consistently in feed + inline, dismissal works — every rule in all three categories now has an explicit fire/no-fire test (`insights/*.test.ts`, 35 tests), plus a dismissal round-trip test.
- [x] `data/*.db` unreadable without the passphrase — verified directly: the file has no `SQLite format 3` header, and the plain `sqlite3` CLI reports "file is not a database" without the SQLCipher key.
- [x] Full keyboard-only pass on unlock/dashboard/finance — verified live with Playwright: passphrase autofocus → Tab → Enter unlocks with no mouse; dashboard/finance nav, insights banner, chart toggle, due-worklist actions, and all three Finance forms are reachable in a single logical Tab order with no traps.
- [x] `pnpm test` passes including `vitest-axe` — 27 test files, 153 tests, all passing; `pnpm exec tsc --noEmit` and `pnpm lint` both clean (one pre-existing, unrelated React Compiler warning on `data-table.tsx`'s TanStack Virtual usage).

## Notable implementation decisions

- **A shared in-memory test DB harness (`src/test/db.ts`) replaces mocking entirely.** `setupTestDb()`/`teardownTestDb()` point the app's real `getDb()` singleton (`src/modules/core/db/client.ts`) at a fresh `:memory:` SQLite database with every Drizzle migration applied, by writing directly into the same `globalThis` slot `openDatabase()` uses in production. Every service test hits real Drizzle queries against a real (if empty) schema — no query logic is mocked, so a test can't pass against a query that would actually fail.
- **Service tests seed data exclusively through the modules' own `create*` functions, never raw SQL or hand-built fixture objects** — this doubles as a live check that the create path itself works, and keeps tests resilient to schema column additions.
- **The bulk of this phase's test-writing was parallelized across background agents**, split by module/file-ownership boundaries (finance-core, finance's computation-heavy services, insights+health+mental) so they could run concurrently without touching the same files; each agent's output was typechecked, run, and spot-checked before being accepted.
- **`vitest-axe@0.1.0`'s shipped types don't merge with vitest 4's `Assertion<T>` interface** (the package still augments an old `Vi.Assertion` namespace vitest 4 no longer uses) — rather than fighting module-resolution edge cases from pnpm's strict `node_modules` layout, the fix is a single isolated helper (`src/test/a11y.ts`'s `expectNoAxeViolations`) that does the one necessary type cast in one place instead of at every call site. The runtime matcher itself works correctly; only the types needed a workaround.
- **Accessibility tests render the actual page components directly** (`DashboardPage`, `FinancePage` — both synchronous Server Components with no `cookies()`/`headers()` calls) via `@testing-library/react`, seeded through the same test DB harness — not a separate mock-heavy rendering path. `UnlockPage` is `async` and calls `getSession()` (needs a real Next.js request context), so its accessibility check instead renders the actual static Card markup plus the real `UnlockForm` client component, which is the entire interactive/accessible surface of that page.
