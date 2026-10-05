# Currency & FX

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [net-worth.md](./net-worth.md) · [investments.md](./investments.md) · [tax-planning.md](./tax-planning.md)

The module is multi-currency from the storage layer up. Launch currencies: **INR, USD, GBP, EUR**.

## Storage

Every monetary value is a pair: `amount_minor` (integer, in the currency's minor units) plus `currency`.

**Why not a single `money` column type:** the previous design used a Drizzle `customType` that multiplied rupees by 100 at the column boundary. A `customType` callback only ever sees its own column's value, so it cannot read a sibling `currency` to pick the right exponent — and exponents differ (JPY 0, INR/USD/GBP/EUR 2, KWD 3). Keeping that type and adding a currency column beside it is not a working compromise; it is silently wrong for every currency that isn't 2-decimal.

Units and prices are scaled integers too (`units_scaled` at 1e6, `price_scaled`), because holding value was previously integer-exact units × float price — so cash was exact while investments drifted.

## Currency is pinned at the account

Every transaction leg on an account is in that account's currency. This keeps balance computation a single exact-integer grouped sum, which is the hot path for balances, net worth, allocation and emergency-fund coverage.

**Cross-currency transfers carry both legs on the row** — `amount_minor`/`currency` for the outgoing side, `to_amount_minor`/`to_currency` for the incoming. The rate is therefore implied by what actually happened and never needs a lookup. The truth is what the bank did, not what a rate table says it should have done.

## Base currency is a display setting

The user picks a base currency for reporting. It is **never written into a row**. Values keep their original currency permanently, and switching base from INR to USD re-converts at read time using the same dated rates — so no historical number moves.

Storing a converted value is the silent-corruption trap in multi-currency: it freezes a rate, and any later correction or back-fill of that rate leaves the stored number stating a figure its own cited rate no longer produces.

## Rates

`finance_fx_rates` holds one series per currency against a **single pivot**, triangulated for cross-pairs — adding a currency is one new series, not N more pairs. Daily close, mid-rate, one row per currency per date.

Source at launch is the **ECB daily reference series** (public domain, EUR pivot, covers USD/GBP/INR). Rates are reference data, not user data, so they live in a shared plaintext store refreshed by a background job that holds no vault key.

## Conversion is always auditable

Any total that crossed a currency boundary states how:

```
{ baseMinor, baseCurrency,
  byCurrency: [{ currency, minor, rate, rateDate, rateSource }],
  stale: boolean }
```

`stale` is set when the newest available rate for a contributing currency is older than the configured bound.

**Never `SUM(amount * rate)` in SQL.** Per-currency subtotals come from adding `currency` to the GROUP BY; conversion happens in TypeScript afterwards. Float arithmetic on money in SQL is the exact defect integer storage exists to prevent.

## Rates that cannot be known

No rate is ever invented. A trend point earlier than the first stored rate for a contributing currency is **flagged unknown**, never converted at today's rate. Presenting a back-converted figure as if it were observed is worse than presenting a gap.

## Tax converts to INR, not to base

Statutory figures — 80C/80D limits, LTCG exemption, slab thresholds, standard deduction — are Indian rupee amounts fixed in law. Tax aggregates therefore convert to **INR**, which is a different conversion target from net worth and must not be conflated with the user's chosen base currency.
