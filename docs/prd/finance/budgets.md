# Budgets

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [currency-fx.md](./currency-fx.md) · [cash-flow.md](./cash-flow.md) · [alerts.md](./alerts.md) (headroom/overrun rules)

One row per category per effective period:

| Field                      | Notes                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| `category_id`              |                                                                              |
| `limit_minor` / `currency` | The monthly limit, in the budget's **own currency**                          |
| `effective_from`           | A budget changes going forward as a **new row**; earlier rows stay queryable |

**Why append-only:** editing a limit in place would rewrite what the budget was last quarter, and every past overrun or headroom reading would silently change. Already the behaviour, and it matches the lifecycle policy in [provenance-lifecycle.md](./provenance-lifecycle.md).

**Actual spend** per category per month is computed on demand, never stored, so it is always correct against real transaction history. Voided transactions are excluded, and transfers are never spending — see [cash-flow.md](./cash-flow.md).

## Currency

A budget limit carries its own currency (a household in India may budget groceries in INR and a UK-travel category in GBP). Spend recorded in other currencies **converts into the budget's currency** for comparison, using the dated rate on each transaction's date.

Conversion follows [currency-fx.md](./currency-fx.md): per-currency subtotals come from a `GROUP BY currency` in SQL, conversion happens in TypeScript, and the result states the rate and date used and whether any rate was stale. Where no rate exists for a transaction's date, that spend is flagged unknown rather than converted at today's rate.

**Why the budget's currency and not the base currency:** the limit is a promise the user made in a specific currency. Comparing in the base currency would make an on-target budget appear to overrun whenever the base moved against it.
