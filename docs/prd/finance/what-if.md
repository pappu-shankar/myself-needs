# What-if Scenarios

**Related:** [goals.md](./goals.md) · [risk.md](./risk.md) · [net-worth.md](./net-worth.md) · [cash-flow.md](./cash-flow.md) · [debts-loans.md](./debts-loans.md) · [currency-fx.md](./currency-fx.md) · [ai-planner.md](./ai-planner.md)

A scenario applies a hypothetical change to a copy of the current snapshot and shows the difference. Nothing is written to the ledger.

## Scenarios

| Scenario | Parameters |
|---|---|
| Large purchase | Amount, date, funded from which account or by new debt |
| Loan prepayment | Loan, amount, one-off or recurring; reduce tenure or reduce EMI |
| Market fall | Percentage fall by asset class |
| Income change | New monthly income from a date |
| Job loss | Months without income, and expense reduction if any |
| Increased SIP | New monthly amount into a linked holding |
| Selling an asset | Holding or account, units, date; tax from [tax-planning.md](./tax-planning.md) is applied |
| Currency move | Percentage move of a currency against the base |
| Inflation | A different inflation rate for goal targets and expenses |

## Output

Every scenario shows its effect on four things, before and after:

- **Net worth**, including per-currency subtotals where currency is involved.
- **Cash flow**: monthly surplus or deficit, and months of runway.
- **Debt**: outstanding, EMI burden, and the date debt-free.
- **Specific goals**: funded percentage, required monthly funding and success probability, using the same Monte Carlo as [goals.md](./goals.md).

Inputs carry their confidence, so a result built on estimated values says so. Assumptions are listed beside the result and are editable; changing one re-runs the scenario.

## Scope boundary

A scenario answers **"what does this decision do to this goal"**. It does not answer **"what will my net worth be in 2035"**. Open-ended long-term net-worth forecasting is deliberately out of scope: it requires assumptions about returns, income and spending so far ahead that the output would be precision without meaning, and a single confident figure would invite the reading that the app can predict wealth. Scenarios are bounded by the goal horizons and short-term cash-flow windows they act on.
