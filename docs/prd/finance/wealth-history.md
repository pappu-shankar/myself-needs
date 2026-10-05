# Wealth History & Attribution

**Related:** [net-worth.md](./net-worth.md) · [currency-fx.md](./currency-fx.md) · [cash-flow.md](./cash-flow.md) · [investments.md](./investments.md) · [returns-analytics.md](./returns-analytics.md) · [provenance-lifecycle.md](./provenance-lifecycle.md)

## Net worth over time

A series of month-end points, each computed by the net-worth function as of that date; nothing is stored. Each point has the net-worth return type: base total, per-currency subtotals with rate, rate date and source, confidence mix, and `stale`.

Computation is batched as a small fixed set of set-based queries over the whole range, not per-month queries per holding. The earlier shape issued `1 + 12 × (3 + 2N)` queries for a 12-month trend (about 757 at 30 holdings); batching first, and only then caching, is the order. A cache, if added, keys on the FX rate table too.

## Unknown points

A point earlier than the first stored rate for any **contributing** currency is flagged **unknown**, never converted at the nearest or today's rate. The point still shows what is knowable: the base-currency portion and the native subtotals of the unconvertible currencies. The line breaks rather than bridging the gap.

**Why not back-convert:** a back-converted figure is indistinguishable on the chart from an observed one, and a trend that looks continuous is read as measured. A gap is honest; an invented point is not.

## Attribution

Decomposes the change between two points into what caused it. All components are in base currency, over the same entity scope, and sum to the total change.

| Component       | Definition                                                                                |
| --------------- | ----------------------------------------------------------------------------------------- |
| Income          | Non-voided income transactions in the period                                              |
| Spending        | Non-voided expenses, excluding transfers and tax                                          |
| Tax             | Tax paid, separated from spending                                                         |
| Investment gain | Change in investment value minus net contributions; realized plus unrealized, shown split |
| Property gain   | Change in valuation of real-estate and similar holdings, net of purchases                 |
| Debt reduction  | Principal repaid on liabilities, **net of interest**, which is spending                   |
| FX effect       | Change from currency movement on non-base balances                                        |
| Unexplained     | Residual                                                                                  |

**Why transfers do not appear:** a transfer moves money between accounts and nets to zero in net worth. Counting it would credit spending or income that did not occur.

**Why FX effect and a residual are explicit:** a rupee-denominated wealth change that includes a weakening dollar is partly currency, and hiding it inside "investment gain" credits the user with a skill that was exchange rate. A non-zero residual is shown, not forced to zero, because a plugged balance hides a wrong component. Components with unknown inputs (a missing rate) are marked unknown and exclude the residual from being reported as exact.

**Why debt reduction is net of interest:** paying down principal raises net worth; paying interest does not. Treating the whole EMI as debt reduction overstates progress.

Each component carries confidence and mix: investment gain on an estimated private holding is labelled as resting on an estimate.
