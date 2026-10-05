# Information Architecture

**Related:** [alerts.md](./alerts.md) · [goals.md](./goals.md) · [risk.md](./risk.md) · [what-if.md](./what-if.md) · [tax-planning.md](./tax-planning.md) · [net-worth.md](./net-worth.md) · [cash-flow.md](./cash-flow.md)

Finance is organised into six sections.

| Section | Pages |
|---|---|
| MONEY | Cash & bank, income, spending, cash flow |
| WEALTH | Net worth, investments, other assets, wealth history |
| DEBT | Loans, credit, debt analysis |
| GOALS | All goals, progress, planning |
| TAX | Overview, capital gains, income, planning |
| INTELLIGENCE | Financial health, risk, alerts, what-if |

## Structural constraints

**Nested inside finance, not new top-level tabs.** The app-level sidebar is full: its config documents that the mobile tab bar has no room for a ninth tab. The six sections are a section navigation under `finance/`, with a finance layout.

**Defined once, in a single config.** The structure is currently duplicated by hand across five places: the nav config, the breadcrumb label map, the finance hub grid, three sub-hub card lists, and per-page "Back to..." links. Each addition meant editing all of them and they drifted. One IA config now drives the section nav, breadcrumbs, hub cards and back-links, so a page is added in one place.

## Home as command centre

Home answers one question: **"what is happening with my money, and what needs my attention?"** It holds an overview (net worth with its confidence mix, cash position), the prioritised alerts from [alerts.md](./alerts.md), and quick actions (add transaction, record a valuation, import a statement).

It is deliberately not a dashboard that tries to contain everything. Detail lives in the sections; Home links into them.

A **Recommendations** page under INTELLIGENCE is reserved for the [AI planner](./ai-planner.md), which is a future enhancement. The section works without it: financial health, risk, alerts and what-if are all deterministic and need no model.
