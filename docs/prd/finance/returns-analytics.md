# Returns & Analytics

**Related:** [investments.md](./investments.md) · [currency-fx.md](./currency-fx.md) · [allocation.md](./allocation.md) · [tax-planning.md](./tax-planning.md) · [calculators.md](./calculators.md) (reuses these functions) · [../../architecture/system-design.md](../../architecture/system-design.md)

Computed uniformly from `investment_cash_flows` at any level (holding, account, entity, portfolio) by taking that level's non-voided flows plus its current value as a final "as of today" inflow.

| Metric                        | When                                                                                                                                          | Implementation                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **XIRR**                      | Default "your returns" figure. Handles irregular, dated flows (SIPs, top-ups, partial withdrawals, dividends) as the fund industry reports it | `xirr` package (Newton-Raphson); not hand-rolled, since non-convergence and all-same-sign flows are easy to get subtly wrong |
| **IRR**                       | Evenly spaced periods rather than real dates; for explicit periodic comparisons                                                               | Direct Newton solve                                                                                                          |
| **CAGR**                      | One start and one end value, no interim flows                                                                                                 | Closed form                                                                                                                  |
| **Absolute return**           | Total gain ÷ total invested over the holding period                                                                                           | Closed form                                                                                                                  |
| **Inflation-adjusted return** | Real return: `(1 + nominal) / (1 + inflation) − 1`, never nominal minus inflation                                                             | Closed form over a stated inflation series                                                                                   |

All live in `modules/finance/service/returns.ts` as pure functions, so the same code serves the real numbers and the calculator page.

## One currency per calculation

A return computed across mixed currencies is meaningless: a sum of rupee and dollar flows is not a cash-flow series. So **every flow converts to a single currency before the solve**, and the result always states which.

```
{ rate, currency, basis: 'base' | 'native', confidence, mix }
```

- `basis: native` — a holding's flows in its own currency. Excludes currency movement; this is the asset's return.
- `basis: base` — each flow converted at the rate **on its own date**, and the closing value at the as-of rate. Includes currency movement, so it is what the user actually earned in their base currency.

**Why per-flow dated rates:** converting everything at today's rate removes the currency effect from the history and reports a figure no one earned. The two bases differ by exactly the FX effect, and showing both separates asset performance from currency performance.

A flow with no available rate (before the first stored rate for its currency) cannot be converted. The return is then reported as **unknown for that basis**, not computed with the flow omitted or back-converted — see [currency-fx.md](./currency-fx.md).

## Realized and unrealized

Returns are reported separately, then combined, never blended silently.

| Part       | Source                                              |
| ---------- | --------------------------------------------------- |
| Realized   | Closed lots (matched by units) plus income received |
| Unrealized | Open lots at current value against their cost       |

**Why separate:** unrealized gain is a valuation, subject to provenance and staleness; realized gain is a fact that the ledger settled. A headline return mixing the two hides how much of it rests on an estimate. Both carry the confidence of the values behind them.

## Edge cases

- All flows the same sign, or a held period too short, returns "not computable", not zero.
- Voided flows are excluded; a correction changes a return only by appearing as a visible void plus replacement.
- A holding valued by the net-invested fallback has a return of zero by construction and is excluded from return aggregates rather than dragging them down.
