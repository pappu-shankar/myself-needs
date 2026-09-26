# Budgets

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [insights.md](./insights.md) (headroom/overrun rules)

One row per category:

| Field | Notes |
|---|---|
| `category_id` | |
| `monthly_limit` | |
| `effective_from` | Lets you change a budget going forward without losing history of what it used to be |

**Actual spend** per category per month is computed on demand via SQL (`SUM` of expense transactions in that category/month) — never stored, so it's always correct against real transaction history.
