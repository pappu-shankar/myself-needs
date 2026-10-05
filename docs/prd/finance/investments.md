# Investments

**Related:** [returns-analytics.md](./returns-analytics.md) · [net-worth.md](./net-worth.md) · [allocation.md](./allocation.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [institutions.md](./institutions.md) · [tax-planning.md](./tax-planning.md) (capital gains reuses the cash-flow ledger) · [goals.md](./goals.md) · [risk.md](./risk.md)

Every instrument type — equity, international equity, mutual funds, ETFs, bonds, gold, FD, RD, chit funds, government schemes, private holdings, other physical assets — is modelled the same way: one `investment_holdings` row plus a shared `investment_cash_flows` ledger.

**Why one shape:** a single ledger of dated, signed flows is what makes returns computable uniformly at any level (holding, account, entity, portfolio) with no per-type code. Depth is added as attributes on the holding and as typed rows in the same ledger, never as a parallel schema per instrument.

## The holding

| Field                                  | Notes                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`, `name`                         | Instrument type and display name                                                                                               |
| `entity_id`, `institution_id`          | Whose it is, and where it is held — see [entities-ownership.md](./entities-ownership.md), [institutions.md](./institutions.md) |
| `account_id`                           | Optional; a holding may be standalone                                                                                          |
| `currency`                             | The currency the holding trades and is valued in. International holdings keep it permanently                                   |
| `units_scaled`                         | Integer units at 1e6 scale                                                                                                     |
| `liquidity`                            | `liquid` · `semi_liquid` · `illiquid`, defaulted from `type`, overridable                                                      |
| `sector`, `country`, `market_cap_band` | Classification feeding [allocation.md](./allocation.md); user-editable, `unknown` allowed                                      |
| `archived_at`                          | Archived, never deleted while history references it                                                                            |

**Why scaled integers:** value was integer-exact units multiplied by a float price, so cash was exact while investments drifted. `units_scaled` (1e6) and `price_scaled` are integers; the product overflows 2^53 at realistic sizes (1e4 units at a price of ₹5,000 is about 5e19), so the single multiply happens in `BigInt` inside one `valueOfUnits()` helper and `BigInt` never leaves it. Prices carry their own `price_currency`, since a holding can be quoted in a currency other than the account's.

## Position depth

Per position the module computes, never stores:

| Measure        | Derivation                                                         |
| -------------- | ------------------------------------------------------------------ |
| Quantity       | Sum of unit-bearing flows and corporate actions                    |
| Average cost   | Cost basis of remaining lots ÷ quantity, in the holding's currency |
| Market value   | `valueOfUnits(units_scaled, price_scaled)` at the latest valuation |
| Unrealized P&L | Market value − cost basis of remaining lots                        |
| Realized P&L   | Proceeds − cost basis of the lots sold, matched **by units**, FIFO |
| Income         | Dividends and interest, summed from the ledger                     |

**Why lots match by units:** an amount-based match cannot tell a partial sale of an appreciated lot from a partial sale of a depreciated one, so it structurally cannot produce a capital loss. Realized and unrealized stay separate everywhere they are shown — see [returns-analytics.md](./returns-analytics.md).

## The cash-flow ledger

`investment_cash_flows`: `holding_id`, `date`, `amount_minor` + `currency` (negative = money in, positive = money out), `units_scaled` where the flow moves units, `flow_type`, plus provenance fields.

| `flow_type`                          | Meaning                       |
| ------------------------------------ | ----------------------------- |
| `contribution`, `redemption`         | Purchases and sales           |
| `dividend`, `interest`               | Income, no unit change        |
| `maturity`                           | Term instruments paying out   |
| `split`, `bonus`, `rights`, `merger` | Corporate actions — see below |

Ledger rows are immutable: a correction is a void plus a replacement, so a reported return never moves silently — see [provenance-lifecycle.md](./provenance-lifecycle.md).

## Corporate actions

Corporate actions change units and cost per unit without changing what was paid, and are recorded as ledger rows so the position stays derivable.

| Action                | Effect                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Split / reverse split | Units multiply by the ratio; total cost basis unchanged, so average cost divides                |
| Bonus                 | Extra units at zero cost; basis spread over the larger quantity                                 |
| Rights                | A contribution (cash out) at the rights price for new units                                     |
| Merger / demerger     | Units and basis carry to the successor holding by ratio; the old holding is archived and linked |

**Why not just edit units:** editing units on a holding rewrites every price and return computed against it. A dated action leaves earlier valuations true as of their date.

## Valuation bases

Four bases exist; each valuation row records which one produced it through provenance `method`.

| Basis                 | Instruments                                     | `method`                                                       | Notes                                                                                        |
| --------------------- | ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Market valuation      | Listed equity, funds, ETFs, gold, bonds at mark | `api_quote` where a provider supplied it, `manual` where typed | `units × latest price`                                                                       |
| Accrual               | FD, RD                                          | `accrual`                                                      | From stored `interest_rate`; value between deposit and maturity is an estimate, not an entry |
| Scheme balance        | PPF, EPF, NSC and similar                       | `manual` or `statement_import`                                 | The balance the scheme reports; the notified rate is reference only                          |
| Net-invested fallback | Anything with no valuation                      | `unknown`, confidence `estimated`                              | Contributions − redemptions. Shown as a fallback, never as a market value                    |

**Why net-invested is a fallback and not a default:** it is the only figure always available, and it is always wrong once an asset has moved. It is labelled so it cannot be mistaken for a mark.

`unknown` is a real `method` value: pre-existing valuations cannot be told apart (a refreshed NAV and a hand-typed price look identical), so none is back-stamped. Valuations are dated replacements; a same-day re-entry supersedes and keeps the earlier revision.

## Private and illiquid holdings

Unlisted shares, startup equity, ESOPs, angel stakes and PE/VC commitments are ordinary holdings with `liquidity = illiquid`. They have no quote, so value is a **dated user estimate** (`method = user_estimate`, confidence `estimated`) with its `as_of` date and a note on the basis (last round, 409A, DCF). A value older than the stale bound shows as stale rather than current. ESOPs record granted, vested and exercised units separately; only vested units count towards value.

**Why flagged illiquid and not discounted:** the app does not know the right discount and inventing one fabricates precision. It keeps the user's number, labels it, and lets [net-worth.md](./net-worth.md) report liquid and illiquid wealth separately.

## Fund-level attributes

| Attribute           | Notes                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| NAV, units          | Value = units × NAV                                                                           |
| Expense ratio       | Annual cost drag; surfaced against return                                                     |
| Benchmark           | Named index, for comparison only                                                              |
| Category            | e.g. large cap, liquid debt, hybrid — drives allocation, see below                            |
| Underlying holdings | Where known, enables **fund overlap**: the same stock held directly and through several funds |

Category is what stops a debt fund counting as equity in [allocation.md](./allocation.md). Overlap is computed from underlying holdings and flagged as a concentration risk in [risk.md](./risk.md).

## Per-type behaviour

| Type                                                          | Notes                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Equity, international equity, funds, ETFs, gold, other assets | Units + valuations. Other assets (jewellery, silver) are always manual: no price source exists |
| Bonds                                                         | Purchase, coupons, maturity; value is a mark or face value if held to maturity                 |
| FD / RD                                                       | Deposits and payout; value by accrual                                                          |
| Chit funds                                                    | Contribution log plus dividend or payout. No bid mechanics, deliberately                       |
| Government schemes                                            | Scheme balance basis, from `scheme_templates`                                                  |
| Dividends                                                     | Not a holding type; a `dividend` flow against the paying holding                               |

## Price providers

All sit behind one `PriceProvider` interface. Domestic mutual-fund NAV comes from the free `mfapi.in` AMFI feed, on manual refresh. Other markets need a licensed feed; the interface means adding one touches no schema or calculation. Market data is reference data, not personal data, so it lives in a shared plaintext store and is joined to a vault at read time.

## Scheme templates

`scheme_templates` ships pre-seeded with common Indian schemes (PPF, EPF, NSC, SSY, SCSS, KVP, Post Office schemes): name, lock-in, interest type and notified rate. Rates are editable because the government revises them. A template supplies reference info only; the holding itself uses the same ledger as everything else.
