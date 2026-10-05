# Tax Planning (India, Analysis Only)

**Related:** [investments.md](./investments.md) (lots and cash flows) · [insurance.md](./insurance.md) (80C/80D) · [currency-fx.md](./currency-fx.md) (INR conversion) · [alerts.md](./alerts.md) (compliance rules) · [goals.md](./goals.md)

India-first. The module does **analysis and planning**: projections, capital gains, loss harvesting, deduction headroom, regime comparison and "what tax if I sell these". Everything is driven by **editable per-fiscal-year policy tables**, never hardcoded rates, because tax rules change with each budget.

## Out of scope: ITR preparation and e-filing

The module never prepares a return, fills a form or files anything. **Why:** filing means maintaining every ITR form and schedule against each year's changes, and carries an accuracy liability (a wrong filed return has consequences for the user) that nothing else in the app carries. Analysis can be wrong by a rounding and be corrected next time the page loads; a filed return cannot. Every tax figure is labelled an estimate for planning, not a substitute for a CA or filing software.

## Policy table (per fiscal year)

One editable set per financial year (April–March), so last year's numbers stay correct when this year's change:

| Group | Contents |
|---|---|
| Slabs | Old and new regime slab thresholds and rates, standard deduction, rebate (87A) and its income ceiling, surcharge bands |
| Deductions | 80C, 80D (self/parents, senior-citizen variants), NPS 80CCD(1B), home-loan interest limits |
| Capital gains | Equity and debt/gold holding-period thresholds, STCG and LTCG rates, the LTCG exemption amount |
| Cess | Health and education cess percentage |

**Currency:** every statutory amount here is **INR**, and tax aggregates convert to INR, not to the user's base currency. These figures are rupee amounts fixed in law; a USD-based user's tax estimate must still compare against ₹1.25 lakh, not a converted number. This is a different conversion target from net worth and must not be conflated with it. See [currency-fx.md](./currency-fx.md).

## 80C / 80D utilisation

For the current fiscal year, sums contributions to PPF/NSC/SSY, ELSS holdings (`is_elss`), tax-saver FDs (`is_tax_saver`) and 80C-eligible premiums, against the limit in the policy table. 80D does the same for health-insurance premiums. Headroom and months remaining feed [alerts.md](./alerts.md).

## Capital gains: unit-based FIFO lot matching

Each purchase is a **lot** (date, units, cost per unit, currency). A sale consumes the earliest lots first, **by units**, and each consumed slice yields a gain or loss as `units × (sale price − lot cost per unit)`, classified STCG or LTCG by that lot's holding period against the policy thresholds. A partially consumed lot keeps its remaining units and original date.

**Why units and not amounts:** the previous version matched rupee amounts of contributions against redemptions. A rupee match carries no price at either end, so it could only ever allocate a redemption against a contribution of equal value and report a non-negative result. It **structurally could never produce a capital loss**, which made tax-loss harvesting impossible, and it misdated gains whenever one lot straddled two sales. Units carry the price and the date through the match, so losses fall out of the same arithmetic as gains.

Foreign-currency lots are matched in their own currency and each leg converted to INR at its own transaction-date rate, because Indian tax measures the gain in rupees, not in the asset's currency.

## Tax-loss harvesting

From open lots, lists those currently below cost, the loss each would realise, and whether it would be short- or long-term. Realised losses are set off against gains in the legal order (short-term loss against either, long-term loss against long-term only) and unused losses are shown as carry-forward. The output states the tax saved if the loss is realised and the lots that would remain. It never says which security to buy instead.

## "What tax if I sell these"

The user selects holdings and units; the module runs the same FIFO match as a dry run against today's valuation, stacked on gains already realised this year and the LTCG exemption already used, and shows the incremental tax. Nothing is recorded. The valuation's confidence ([provenance-lifecycle.md](./provenance-lifecycle.md)) is shown beside the result, since an estimated price gives an estimated tax.

## Income: dividends, interest and TDS

Dividend and interest income are summed by fiscal year from income transactions and holdings, with TDS deducted recorded per source. The module shows gross income, TDS credit and the residual tax expected, flagging sources where TDS was not deducted but tax will be due.

## Old vs new regime

Using income, 80C and 80D utilisation and other deductions, applies both regimes from the policy table and states which is better and by how much, with the one-line reason. Computed from actual figures each time, so it flips as income and deductions change.
