# Finance Module: Current-State Assessment

**Status:** Superseded — see the banner below.

**Related:** [Finance product requirements](../prd/finance/) · [Finance build roadmap](../roadmap/phase-2-finance.md) · [Data model conventions](./data-model.md) · [Phase 9 — finance re-model](../roadmap/phase-9-finance-remodel.md)

> **Superseded.** This document assessed the Phase 2 finance module as built. Its recommendations have been decided and folded into [Phase 9](../roadmap/phase-9-finance-remodel.md) and the rewritten [finance PRDs](../prd/finance/); the companion future-state proposal it refers to has been retired now that its open decisions are answered. Kept for the evidence behind those decisions — the findings below describe the pre-re-model code and are no longer a description of intended behaviour.

## Executive summary

Finance is a broad, manually maintained personal-finance workspace, not a bank-connected accounting system. It combines everyday account balances and transactions with budgets, recurring worklists, insurance records, investment holdings, debt calculations, tax estimates, reports, calculators, and rules-based insights. The module has a clear internal layering and a strong preference for deriving balances and reports from ledgers rather than storing duplicate totals.

The build is complete against its 14-step roadmap, but “complete” means the planned surfaces were implemented; it does not mean every asset has a dedicated model or that every record can be maintained throughout its lifecycle. The most important product/design questions are:

1. Should investment holdings remain one flexible model, or should common instrument classes get validated, type-specific detail?
2. Should account, transaction, and holding records be editable, correctable, or archived after creation?
3. Which parts of the user's asset list need an explicit first-class type, and which are adequately represented by a generic asset?
4. Which tax/insight features are valuable enough to keep current as policy changes?

**Recommendation:** keep the encrypted-vault, ledger-first foundation and core account/transaction/budget/investment workflows. Before extending the feature set, improve record lifecycle and investment-type clarity, then validate the derived tax and advice-like features against current policy and actual use. Simplify the navigation and postpone integrations, detailed accounting, automated valuation, and cross-currency support unless the product direction changes.

## Scope and evidence

This review compares the implementation surfaces with the existing requirements in [the finance PRDs](../prd/finance/) and the completion notes in [the finance roadmap](../roadmap/phase-2-finance.md). It uses source structure, schemas, services, and routes as evidence; roadmap “Done” notes are treated as implementation history, not as proof that a feature is still useful or correct for current needs.

The user-provided asset list is: all types of loans; domestic equity; domestic mutual funds; bank accounts; domestic bonds; international equity, bonds, and mutual funds; bank deposits; government investments/schemes; physical gold; physical silver.

This is a product/model assessment, not a security audit, financial-advice review, or production-data inspection. No live vault data was read.

## How the current module is built

### Request and module flow

Finance follows the app's layered architecture:

1. The protected route in `src/app/(protected)/finance/` calls finance's public surface to compose pages and views. Cross-module composition (for example, joining a finance holding to a plan goal) happens in `app/`, not inside finance.
2. Forms call finance Server Actions. The shared action wrapper enforces the signed-in request scope, validates input, and binds reads/writes to that user's vault.
3. Finance `service/` functions hold business rules and calculations. They call the module's own database queries.
4. `db/queries/` builds Drizzle queries over `db/schema/`; the finance tables live in each user's encrypted vault.

The public module boundary is [src/modules/finance/index.ts](../../src/modules/finance/index.ts); type constants and enumerations live in [src/modules/finance/types.ts](../../src/modules/finance/types.ts). This layering matches the rules in [system-design.md](./system-design.md).

### Main user-facing surfaces

The finance home page links to accounts, categories, transactions, budgets, recurring rules, insurance, debts, investments, reports, tax, calculators, insights, and settings. It also shows a getting-started checklist, balances, net-worth trend, and insights. The entry point is [finance/page.tsx](../../src/app/(protected)/finance/page.tsx).

The 14 roadmap steps describe the build sequence: accounts/categories; transactions; budgets; debts; recurring rules; insurance; investments; returns; net worth; reports/allocation; tax; goal links; calculators; and insights. See [phase-2-finance.md](../roadmap/phase-2-finance.md).

### Core model and data flow

| Area | Current representation | Important behavior |
|---|---|---|
| Accounts | `finance_accounts` | Asset balances are positive; loan and card liabilities are negative. Current balances derive from opening balance plus transactions. |
| Transactions | `finance_transactions` | Income, expense, and transfer. Transfers affect two accounts and are excluded from income/expense rollups. Lists are cursor-paginated. |
| Categories and budgets | Custom income/expense categories; versioned budget rows | Budget actuals are derived from expense transactions; changing a limit preserves prior effective periods. |
| Recurring items | Rules plus confirmed transactions | The app shows due-but-unlogged periods; a person confirms each transaction. It does not silently create transactions or send notifications. |
| Insurance | Policy records, optionally linked to a recurring rule | Premium eligibility flags feed tax estimates; there is no separate policy-premium ledger. |
| Investments | One holding type plus cash flows and optional valuations | Cash flows drive returns and FIFO capital-gain estimates; current value depends on unit pricing, manual marks, or an FD/RD accrual estimate. |
| Tax | Editable financial-year policy/slab configuration | Deduction utilization, capital-gain estimates, and regime comparison are estimates, not filing. |
| Reports and insights | SQL-derived values and rule outputs | Net worth, allocation, spending, and insight snapshots are calculated from finance records rather than stored as duplicate totals. |

Money columns use integer paise at the database boundary and expose rupees to application code via [money.ts](../../src/modules/finance/db/schema/money.ts). This is a good fit for a single-currency INR ledger and avoids floating-point drift in monetary sums. Single currency and no external account linking are also explicit product constraints in [PRD.md](../../PRD.md).

### Investment valuation paths

The investment holding type enum in [types.ts](../../src/modules/finance/types.ts) is `equity`, `intl_equity`, `mutual_fund_domestic`, `mutual_fund_intl`, `bond`, `gold`, `fd`, `rd`, `chit_fund`, `govt_scheme`, and `other_asset`. A holding may optionally be associated with an account, but it can also be standalone. The relevant tables are [investment-holdings.ts](../../src/modules/finance/db/schema/domain/investment-holdings.ts), [investment-cash-flows.ts](../../src/modules/finance/db/schema/domain/investment-cash-flows.ts), and [investment-valuations.ts](../../src/modules/finance/db/schema/domain/investment-valuations.ts).

The valuation paths are not identical:

- Unit-priced holdings are valued using held units times the latest price per unit.
- Domestic mutual funds can manually refresh a NAV; most other unit prices are entered manually.
- FD/RD values use an accrual estimate.
- Bonds, government schemes, and chit funds have deliberately simplified behavior, described in [investments.md](../prd/finance/investments.md).

The shared ledger gives uniform return calculations, but it does not mean all these instruments have the same underlying behavior or valuation certainty.

## Coverage of the requested assets

| User-listed asset | Current coverage | Assessment |
|---|---|---|
| Bank accounts | Checking, savings, and cash account types | Directly represented. Manual opening balance and transaction entry. |
| Loans | A `loan` liability account with interest rate, original amount, EMI, and tenure; a debts page computes amortization and prepayment impact | Suitable for a basic manually tracked loan. It is not a loan-servicing ledger; statements, rate resets, extra payments, and actual schedule reconciliation are not modeled as dedicated loan events. |
| Domestic equity | `equity` holding, units, valuations, and cash flows | Represented with manual valuations; no exchange price refresh. |
| Domestic mutual funds | `mutual_fund_domestic` holding, units, valuations, cash flows, and manual NAV refresh | Most complete market-valued type in the current model. |
| Domestic bonds | `bond` holding | A bond is represented, but domestic-vs-international market, currency, coupon schedule, maturity, and principal repayment are not explicit type-specific fields. |
| International equity | `intl_equity` holding | Type is explicit, but foreign currency and FX conversion are deferred; monetary values therefore remain in the single-currency model. |
| International mutual funds | `mutual_fund_intl` holding | Type is explicit, but currency conversion and valuation data are not modeled. |
| International bonds | `bond` holding only | No separate international-bond type or currency/market attributes. |
| Bank deposits | FD and RD holding types, with annual-rate accrual estimates | Covered at a basic level. Accrual is explicitly an estimate; a bank-exact schedule or institution-specific compounding conventions are not represented. |
| Government investments/schemes | `govt_scheme`, template reference table, and cash-flow ledger | Reference scheme data exists, but each scheme does not have its own contribution, interest-crediting, lock-in, or withdrawal rules. |
| Physical gold | `gold` unit-priced holding | Covered with units and manual valuation. |
| Physical silver | `other_asset` unit-priced holding | Can be entered as a generic unit-priced asset, but there is no explicit silver type or silver-specific reporting. |

**Bottom line:** the current enum covers a number of asset categories, but coverage is not the same as first-class support. International bonds and silver are generic/ambiguous. Domestic/international distinctions do not exist for bonds. Foreign-currency support is explicitly deferred.

## What is working well and should generally stay

### Keep the core ledger and derived-value approach

- **Keep account balances derived from transactions and opening balances.** It avoids maintaining a duplicate mutable balance. The sign convention for liabilities permits a simple signed net sum; the rule is documented in [accounts-transactions.md](../prd/finance/accounts-transactions.md) and implemented in [accounts.ts](../../src/modules/finance/service/domain/accounts.ts).
- **Keep integer-paise storage for money.** It matches INR precision and protects aggregate arithmetic.
- **Keep explicit transfer transactions.** Transfers do not masquerade as spending or income and net out across account balances.
- **Keep pagination and relevant indexes** for transaction history; this supports years of records without requiring all rows in memory.
- **Keep recurring items as a confirmation worklist**, consistent with the app-wide no-notifications and no-silent-entry constraint.
- **Keep pure calculation functions** for amortization and return metrics, reused in portfolio views and standalone calculators.
- **Keep module boundaries and per-user vault scoping.** These are foundational architecture/privacy properties, not finance-specific complexity to remove.
- **Keep policy values editable by fiscal year** rather than hardcoding changing tax slabs and limits, provided the values have clear provenance and are reviewed.

### Keep the estimates clearly labeled

Tax comparisons, FD/RD accruals, allocation heuristics, and insights are not authoritative financial or tax advice. The existing requirements already call out some of these limits. Preserve that distinction anywhere these features remain.

## Recommendations

### Redesign first

1. **Add an intentional record-lifecycle policy.** The finance domain services expose create/read functions for core records, while broad update/delete operations are not exposed. This makes correction of an erroneous account, transaction, holding, or valuation difficult without database-level intervention. Decide whether a record can be edited, voided, archived, or deleted; preserve an auditable correction trail for ledger events where appropriate. This is the strongest day-to-day usability gap in the current model.
2. **Define investment types by the questions users need answered, not by one universal enum.** Keep shared identity and return plumbing where it works, but add type-specific details only where they materially improve valuation or decision-making (for example, bond maturity/coupon and currency; metal identity/unit; deposit compounding/maturity; scheme-specific rules). Do not build bespoke tables for every instrument merely for taxonomic neatness.
3. **Make valuation quality visible.** Distinguish current market price, user-entered estimate, face value, accrued estimate, and stale/missing valuation. A single headline total can otherwise imply more precision than the underlying sources justify.
4. **Treat unsupported foreign currency as an explicit constraint, not as a supported asset feature.** If international investments become a priority, choose whether to store source currency and dated FX conversions before presenting those values as comparable in INR. Until then, clearly warn that international holding values are entered in the app's single currency.

### Simplify or skip

1. **Do not expand the feature surface before core record maintenance works.** Adding more insight rules, calculators, or scheme templates is lower priority than correction/edit/archive workflows and investment valuation clarity.
2. **Consider consolidating overlapping navigation and report cards.** The finance landing page links to 13 sections while also showing summary cards, checklist, chart, and insight content. Keep the underlying capabilities but test whether some should be grouped (for example, reports and insights under an overview) before adding more top-level destinations.
3. **Keep calculators stateless and optional.** They reuse the calculation layer but do not need to drive the core domain model. Remove or de-emphasize any calculators that users do not use rather than making them dependencies for recording real finances.
4. **Skip bank sync, broker sync, CSV import, notifications, and multi-currency conversion unless deliberately approved.** They contradict or expand current product constraints and introduce operational, privacy, or reconciliation decisions. They are not prerequisites for improving the present manual tracker.
5. **Avoid monthly snapshot tables until profiling demonstrates a need.** The existing computed-value approach is simpler and avoids reconciliation drift. Optimize query shape first if real histories make it slow.

### Review and possibly reduce

1. **Tax regime comparison and capital-gains estimates:** verify the supported tax scope, policy-year defaults, and calculation assumptions against current rules before relying on them. The roadmap records seeded FY2024–25-ish defaults; editable values help, but do not by themselves guarantee that a user has current policy data.
2. **“Advocate” insights:** keep objective, explainable checks (for example, missing valuations, likely duplicates, or a configurable utilization threshold) if users find them useful. Reconsider prescriptive language such as “which debt to pay first” or rate arbitrage unless the inputs and limitations are transparent.
3. **Allocation target suggestions:** the age-based heuristic is a starting point, not personal advice. Keep it optional and editable, or remove the suggestion while retaining user-defined targets if it confuses users.
4. **Value vs. complexity:** the 15-rule insights engine adds rules, dismissals, settings, and policy dependencies. Track which rules lead to useful action; prune low-signal rules rather than expanding the engine by default.

## Performance and operational notes

- Net-worth history iterates month by month and requests account and holding totals for each point in [net-worth.ts](../../src/modules/finance/service/domain/net-worth.ts). This is simple for the current default 12-month trend. If it becomes slow, first consolidate the series into batched/grouped queries; do not immediately add mutable snapshots.
- The holdings page loads cash flows and valuations once per holding in [holdings/page.tsx](../../src/app/(protected)/finance/investments/holdings/page.tsx). This is a potential per-holding query fan-out. Measure with realistic holding counts and use batched reads if it is a user-visible bottleneck.
- Financial and investment calculations need tests around calendar boundaries, stale/missing prices, partial redemptions, and unusually long histories. Existing per-domain tests provide a foundation; keep the tests that protect actual financial semantics when simplifying the product.

## Suggested order of work

| Priority | Work | Why |
|---|---|---|
| P0 | Decide and implement edit/correction/archive behavior for core records | Enables safe use of a manual ledger over time. |
| P0 | Review tax scope, seeded policy years, labels, and assumptions | Avoids users mistaking stale estimates for current filing guidance. |
| P1 | Clarify instrument types and valuation confidence, starting with bonds, deposits, government schemes, and metals | Resolves mismatch between the desired asset list and generic/current models. |
| P1 | Improve finance landing/navigation based on actual usage | Makes the completed breadth easier to use without adding more features. |
| P2 | Batch net-worth and holdings detail reads if profiling shows latency | Targets measured query costs while preserving computed-value semantics. |
| Defer | Integrations, import, notifications, full currency support, detailed accounting | These change the current product's scope and constraints. |

## Open product decisions

These questions should be answered before changing schema or user-facing behavior:

1. Which of the listed assets do you personally expect to track regularly, and which are just desirable categories?
2. Should silver and domestic/international bonds be first-class types, or is a well-labeled generic asset/bond record sufficient?
3. For international assets, is it acceptable to enter an INR estimate manually for now, or is original currency plus FX essential?
4. For ledger corrections, should users edit/delete, or should financial transactions be reversed/voided to preserve history?
5. Which tax estimates and insights are used enough to justify keeping their ongoing policy-maintenance burden?

## Proposed next step

The decisions these findings fed into, each with its reasoning, are recorded in the [Phase 9 decisions log](../roadmap/phase-9-finance-remodel.md#decisions-log).
