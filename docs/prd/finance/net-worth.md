# Net Worth

**Related:** [entities-ownership.md](./entities-ownership.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [investments.md](./investments.md) · [debts-loans.md](./debts-loans.md) · [allocation.md](./allocation.md) · [wealth-history.md](./wealth-history.md) · [risk.md](./risk.md) · [../../architecture/data-model.md](../../architecture/data-model.md)

Net worth is **assets minus liabilities as of a date**, and for a user with more than a salary account there is no single such number. The module computes several named definitions over the same underlying values and always labels which one is on screen.

## Definitions

| Definition            | Includes                                                                                                | Excludes                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Total**             | Every asset and liability of the `Self` entity not marked `exclude_from_net_worth`                      | Other entities                                               |
| **Liquid**            | Total, restricted to `liquid` assets, less liabilities due within the horizon                           | `semi_liquid`, `illiquid`                                    |
| **Investable**        | Liquid plus `semi_liquid` financial assets (listed securities, funds, deposits)                         | Property, private and business holdings, personal-use assets |
| **Financial**         | All financial assets (bank, securities, deposits, schemes, private holdings) less financial liabilities | Real estate, vehicles, jewellery                             |
| **Household**         | Full entity rollup, each entity prorated by the user's stake                                            | None by entity                                               |
| **Business-adjusted** | Personal entities plus the prorated share of business entities, that share flagged illiquid             | Nothing; the business share is shown, never merged silently  |

Every definition runs over the same consolidated values, so they reconcile: the difference between any two is a nameable set of holdings.

## Liquidity classes

Every account and holding carries `liquidity`: `liquid` (convertible to cash within days at close to value), `semi_liquid` (weeks, or with a penalty or market risk), `illiquid` (no reliable exit, or one that moves the price).

**Why classes and not one total:** ₹5 Cr of business equity must never read as equivalent to ₹5 Cr in deposits. The deposits can pay a bill tomorrow; the equity cannot be sold in part, has no quote, and is worth what a buyer eventually agrees. A single headline that sums them states a capacity to spend that the user does not have, and in a downturn it is the number that fails them. So the headline is always accompanied by its liquidity split, and illiquid wealth is visually separated, not footnoted.

## Ownership and consolidation

Values consolidate in the fixed order from [entities-ownership.md](./entities-ownership.md):

```
sum per (entity, currency) → prorate by ownership_bps → convert at the as-of rate → sum
```

The stake used is the one effective **as of the date asked for**, so net worth in 2024 uses the 2024 stake. Converting before prorating double-rounds; the order is not rearranged for convenience.

## Currency

Net worth is computed per currency first, then converted for the headline. The result always carries per-currency subtotals with the rate behind each:

```
{ baseMinor, baseCurrency,
  byCurrency: [{ currency, minor, rate, rateDate, rateSource }],
  confidence, mix, stale }
```

A reader can reproduce the headline from the subtotals: each `minor × rate` converts to base, and the sum is `baseMinor`. Conversion never happens inside SQL — see [currency-fx.md](./currency-fx.md). Changing the base currency re-converts the same subtotals; no row changes.

## Confidence

The headline carries the weakest contributor's confidence and the mix by value ("₹4.2 Cr — 71% verified, 29% estimated"). A net worth dominated by a user-estimated private holding is visibly resting on an estimate, however precise the bank balances beside it. Stale or missing valuations are shown as such with their last known date, never treated as current.

## Computed, never snapshotted

Net worth is calculated on read, from transactions, opening balances, the latest valuations, accrual estimates and rates. There is no net-worth table.

**Why a snapshot would be actively wrong under multi-currency:** a stored value freezes the rate it was converted at. Back-filling a missing historical rate, which is certain to happen, would then leave the stored figure stating a number its own cited rate no longer produces, while the UI still cites that rate. Computing on read means a corrected rate corrects every figure that uses it.

If performance ever demands it, the order is: batch queries first, and only then cache, with a key that includes the rate table. See [wealth-history.md](./wealth-history.md).

## Per-account behaviour

- Asset accounts add; liability accounts carry a negative balance and subtract. A plain sum is correct.
- `exclude_from_net_worth` removes an account from every definition (an uncertain receivable, for example).
- Voided transactions never contribute; with everything voided the figure is zero.
