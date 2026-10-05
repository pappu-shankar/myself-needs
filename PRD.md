# PRD — Personal Life OS

Product requirements index. This file is a table of contents only — detail lives one-topic-per-file under `docs/prd/`.

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) · [DESIGN.md](./DESIGN.md)

## Modules

| Module | Summary | Status | Doc |
|---|---|---|---|
| Finance | Multi-entity, multi-currency wealth OS — accounts, transactions, cash flow, investments, debt, goals, tax, risk, intelligence | Phase 2 baseline Done (14 steps); being re-modelled, see [Phase 9](./docs/roadmap/phase-9-finance-remodel.md) | [docs/prd/finance/](./docs/prd/finance/) |
| Health | Physical health tracking (metrics, symptoms, medications) + gym & training | Deepened — structured vitals, symptom logging, medication adherence; gym & training built ([gym PRD](./docs/prd/health/gym.md)) | [docs/prd/health.md](./docs/prd/health.md) |
| Mental | Mental health tracking (mood/check-ins, journaling) | Skeleton — kept minimal by explicit user choice, not yet deepened | [docs/prd/mental.md](./docs/prd/mental.md) |
| Plans | Needs, goals, plans/todos | Deepened — financial + non-financial goals, priority, progress tracking | [docs/prd/plans.md](./docs/prd/plans.md) |
| House | 3D house/renovation planning — parametric rooms/floors rendered as an interior+exterior 3D model | V1 | [docs/prd/house.md](./docs/prd/house.md) |
| Dashboard | Cross-module overview/home | Done | [docs/prd/dashboard.md](./docs/prd/dashboard.md) |

## Finance sub-domains

Grouped as the product's information architecture — see [information-architecture.md](./docs/prd/finance/information-architecture.md).

| Area | Topic | Doc |
|---|---|---|
| Foundations | Entities & ownership | [entities-ownership.md](./docs/prd/finance/entities-ownership.md) |
| Foundations | Institutions | [institutions.md](./docs/prd/finance/institutions.md) |
| Foundations | Currency & FX | [currency-fx.md](./docs/prd/finance/currency-fx.md) |
| Foundations | Provenance, confidence & record lifecycle | [provenance-lifecycle.md](./docs/prd/finance/provenance-lifecycle.md) |
| Foundations | Data ingestion (connect / import / manual) | [ingestion.md](./docs/prd/finance/ingestion.md) |
| Money | Accounts, categories & transactions | [accounts-transactions.md](./docs/prd/finance/accounts-transactions.md) |
| Money | Cash flow (operating / investing / financing) | [cash-flow.md](./docs/prd/finance/cash-flow.md) |
| Money | Budgets | [budgets.md](./docs/prd/finance/budgets.md) |
| Money | Recurring transactions & obligations | [recurring-transactions.md](./docs/prd/finance/recurring-transactions.md) |
| Wealth | Net worth (all definitions) | [net-worth.md](./docs/prd/finance/net-worth.md) |
| Wealth | Investments (all instrument types) | [investments.md](./docs/prd/finance/investments.md) |
| Wealth | Returns & analytics (CAGR/XIRR/IRR) | [returns-analytics.md](./docs/prd/finance/returns-analytics.md) |
| Wealth | Allocation | [allocation.md](./docs/prd/finance/allocation.md) |
| Wealth | Wealth history & attribution | [wealth-history.md](./docs/prd/finance/wealth-history.md) |
| Debt | Loans, credit & amortization | [debts-loans.md](./docs/prd/finance/debts-loans.md) |
| Protection | Insurance | [insurance.md](./docs/prd/finance/insurance.md) |
| Goals | Financial goals & funding | [goals.md](./docs/prd/finance/goals.md) |
| Tax | Tax planning (India-first) | [tax-planning.md](./docs/prd/finance/tax-planning.md) |
| Intelligence | Risk engine | [risk.md](./docs/prd/finance/risk.md) |
| Intelligence | What-if simulation | [what-if.md](./docs/prd/finance/what-if.md) |
| Intelligence | Alerts & insights | [alerts.md](./docs/prd/finance/alerts.md) |
| Intelligence | AI financial planner — _future enhancement, not in scope_ | [ai-planner.md](./docs/prd/finance/ai-planner.md) |
| Tools | Utility calculators | [calculators.md](./docs/prd/finance/calculators.md) |
| — | Information architecture | [information-architecture.md](./docs/prd/finance/information-architecture.md) |

## Constraints (apply everywhere)

- Multi-user (each user's data in their own encrypted vault; optional shared spaces; admin-invited accounts; runs locally or on the internet behind HTTPS). A user sees their own data and nobody else's — the admin cannot read it, and there is no third-party professional (auditor, lawyer, CA, advisor) access.
- Data arrives by automatic connection → connector → file/document upload → manual entry, in that order of preference. Automatic is preferred but never required: the product must work fully on manual entry alone, so coverage never depends on whether a given institution exposes an integration.
- Multi-currency (INR, USD, GBP, EUR at launch). Every amount keeps its own currency; base currency is a read-time display setting, never stored into a row.
- Every value carries its provenance and confidence. Estimates, accruals, stale prices and verified records are visibly different, and aggregates report their mix.
- No reminders/notifications — everything surfaces only when you open the app.
- Read-only with respect to money: the product never moves funds, places trades, or executes any financial transaction.
- No AI/LLM features, and no financial data sent to a model provider. Every analysis, score, projection and alert is deterministic and computed locally. Deferred AI work is recorded as future enhancements.
