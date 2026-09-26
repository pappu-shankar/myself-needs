# Reports: Income, Expenses & Allocation

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [net-worth.md](./net-worth.md) · [insights.md](./insights.md)

Route: `app/finance/reports`.

## Income vs. expense

Reuses existing `income`/`expense` transactions and categories: a monthly trend chart, category breakdown, and savings rate (`(income − expense) / income`). No new schema — purely a query/report over data that already exists.

## Current allocation

Current value of every account and holding grouped by asset class (equity, international equity, mutual fund domestic/international, bonds, gold, FD/RD, government schemes, chit, cash) as a percentage of total net worth — one aggregation query, shown as a breakdown chart.

## Suggested/target allocation

Pre-fills a starting target using a simple, commonly-cited heuristic (age-based equity/debt split from an optional age/DOB field in settings, with a small fixed hedge allocation to gold and a cash buffer), stored in an editable `allocation_targets` table (`asset_class`, `target_percentage`) that's freely rewritable.

**Explicitly a formula-driven starting point, not financial advice** — the app shows current-vs-target with the variance (e.g. "equity +8% over target") so the user decides whether/how to rebalance.

## Emergency fund ratio

A computed `StatTile`: liquid assets (checking + savings + cash) ÷ trailing-3-month average monthly expenses = months of coverage (e.g. "4.2 months"). No new schema.
