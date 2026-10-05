# Risk Engine

**Related:** [allocation.md](./allocation.md) · [goals.md](./goals.md) · [debts-loans.md](./debts-loans.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [alerts.md](./alerts.md) · [ai-planner.md](./ai-planner.md)

Six dimensions and a composite score. Scores are **computed on read**, from the same snapshot the rest of the module uses, and never stored.

## Dimensions

| Dimension | Measures | Inputs needed |
|---|---|---|
| Market | Exposure to price falls in listed assets | Allocation by asset class, equity share, volatility assumptions per class |
| Liquidity | Whether obligations can be met without forced sales | Liquid assets by liquidity class, monthly expenses, near-dated goals and debt payments |
| Debt | Strain from borrowing | Debt service against income, credit utilisation, interest rates, floating-rate share |
| Concentration | Dependence on one thing | Share by holding, institution, entity, sector and country |
| Currency | Exposure to FX moves against the base currency | Value by currency, base currency, currency of liabilities and goals |
| Goal | Likelihood that goals are not met | Success probability and funding gap from [goals.md](./goals.md) |

Each dimension reports a 0–100 score, the contributing figures, and a plain-language reading ("63% of liquid net worth sits in one broker").

## Composite

A weighted combination of the six, with the weights visible and editable. A dimension that cannot be computed (no goals defined, no debt data) is **omitted and the composite says so**, rather than counted as zero risk.

## Inputs and confidence

Every score shows the figures it used and their **confidence mix**, as in [provenance-lifecycle.md](./provenance-lifecycle.md). A risk number derived largely from user estimates must say so: "Concentration 71, based 58% on estimated values". Stale valuations are flagged on the score they distort.

## Excluded: behavioural risk

Behavioural risk (overtrading, panic selling) is **deliberately not scored**. It needs trade-timing history, how often and when the user transacts relative to market moves, which the app does not hold: holdings are valued by the user, not fed from a brokerage. A score computed from absent data is worse than no score, so the UI states that behavioural risk is not assessed and why.
