# PRD — Personal Life OS

Product requirements index. This file is a table of contents only — detail lives one-topic-per-file under `docs/prd/`.

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [ROADMAP.md](./ROADMAP.md) · [DESIGN.md](./DESIGN.md)

## Modules

| Module | Summary | Status | Doc |
|---|---|---|---|
| Finance | Accounts, transactions, budgets, debts, investments, tax, insights — the deep module | Done — all 14 build steps complete | [docs/prd/finance/](./docs/prd/finance/) |
| Health | Physical health tracking (metrics, symptoms, medications) | Deepened — structured vitals, symptom logging, medication adherence | [docs/prd/health.md](./docs/prd/health.md) |
| Mental | Mental health tracking (mood/check-ins, journaling) | Skeleton — kept minimal by explicit user choice, not yet deepened | [docs/prd/mental.md](./docs/prd/mental.md) |
| Plans | Needs, goals, plans/todos | Deepened — financial + non-financial goals, priority, progress tracking | [docs/prd/plans.md](./docs/prd/plans.md) |
| House | 3D house/renovation planning — parametric rooms/floors rendered as an interior+exterior 3D model | V1 | [docs/prd/house.md](./docs/prd/house.md) |
| Dashboard | Cross-module overview/home | Done | [docs/prd/dashboard.md](./docs/prd/dashboard.md) |

## Finance sub-domains

| Topic | Doc |
|---|---|
| Accounts, categories & transactions | [docs/prd/finance/accounts-transactions.md](./docs/prd/finance/accounts-transactions.md) |
| Budgets | [docs/prd/finance/budgets.md](./docs/prd/finance/budgets.md) |
| Debts, loans & EMI amortization | [docs/prd/finance/debts-loans.md](./docs/prd/finance/debts-loans.md) |
| Recurring transactions | [docs/prd/finance/recurring-transactions.md](./docs/prd/finance/recurring-transactions.md) |
| Insurance | [docs/prd/finance/insurance.md](./docs/prd/finance/insurance.md) |
| Investments (all instrument types) | [docs/prd/finance/investments.md](./docs/prd/finance/investments.md) |
| Returns & analytics (CAGR/XIRR/IRR) | [docs/prd/finance/returns-analytics.md](./docs/prd/finance/returns-analytics.md) |
| Net worth | [docs/prd/finance/net-worth.md](./docs/prd/finance/net-worth.md) |
| Utility calculators | [docs/prd/finance/calculators.md](./docs/prd/finance/calculators.md) |
| Reports & allocation | [docs/prd/finance/reports-allocation.md](./docs/prd/finance/reports-allocation.md) |
| Tax planning (India) | [docs/prd/finance/tax-planning.md](./docs/prd/finance/tax-planning.md) |
| Goal-linked investments | [docs/prd/finance/goal-linked-investments.md](./docs/prd/finance/goal-linked-investments.md) |
| Insights — auditor/advocate/compliance | [docs/prd/finance/insights.md](./docs/prd/finance/insights.md) |

## Constraints (apply everywhere)

- Single-user, local-only, manual entry (no CSV import, no external accounts linking).
- Single currency; no international-currency handling until an international holding actually exists.
- No reminders/notifications — everything surfaces only when you open the app.
