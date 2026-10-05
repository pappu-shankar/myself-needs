# Allocation

**Related:** [net-worth.md](./net-worth.md) · [investments.md](./investments.md) · [currency-fx.md](./currency-fx.md) · [risk.md](./risk.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [alerts.md](./alerts.md)

Allocation answers "where is the money, along each axis that matters". It is computed from the same consolidated, prorated, converted values as net worth, over the same entity scope, so the two always reconcile.

## Dimensions

| Dimension   | Source                                | Notes                                                                   |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------- |
| Asset class | Holding `type` and fund `category`    | equity, debt, gold, cash, real estate, private, other                   |
| Geography   | Holding `country`                     | `unknown` is its own slice, not folded into home                        |
| Currency    | The holding or account `currency`     | Exposure before conversion, so a rupee view of dollar assets is visible |
| Sector      | Holding `sector`                      | Equity only; funds expand through their underlying holdings where known |
| Market cap  | Holding `market_cap_band`             | Large / mid / small / unclassified                                      |
| Liquidity   | `liquid` · `semi_liquid` · `illiquid` | Same classes net worth uses                                             |

Each dimension is a one-way grouping of the same total, so every dimension sums to the same figure. Cross-tabs (asset class × geography) are supported; no dimension is derived from another.

**Why asset class follows fund category:** the earlier mapping collapsed everything into four coarse buckets and folded debt funds into equity, because a mutual fund was a mutual fund. A liquid or gilt fund is not equity exposure and overstated equity weight by exactly the debt fund balance. That mapping is replaced; classification reads the fund's category, and an unclassified fund shows as unclassified rather than defaulting to equity.

**Why currency is its own axis and not part of geography:** an Indian-listed fund can hold dollar assets and a US-listed ETF can hold Indian ones. Currency exposure is what moves the base-currency value; country is where the business sits.

## Method

Per (entity, currency, dimension value) subtotal, prorate by `ownership_bps`, convert at the as-of rate, sum — the same consolidation order as [entities-ownership.md](./entities-ownership.md). Per-currency subtotals and the rate used are retained so each slice is auditable. Every slice carries confidence and a mix; a slice built mostly from estimates says so.

Liabilities are shown against the asset slice they fund where linked, and otherwise as a separate negative slice; allocation percentages are of gross assets, with net-of-debt alongside.

## Target vs actual

Targets live in an editable `allocation_targets` table (`dimension`, `bucket`, `target_bps`), per dimension, freely rewritable. A starting target can be pre-filled from a simple age-based equity/debt split with a small gold and cash allocation, from an optional date of birth in settings.

**A formula-driven starting point, not advice.** The app shows actual, target and variance ("equity +8% over target", in basis points of the total) and leaves rebalancing to the user.

Variance beyond a configured band feeds [alerts.md](./alerts.md); allocation concentration beyond limits feeds [risk.md](./risk.md).
