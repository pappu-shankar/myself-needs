# Debts, Loans & EMI Amortization

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [calculators.md](./calculators.md) (EMI calculator reuses this) · [insights.md](./insights.md) (utilization/rate-priority rules)

Not a separate table for the debt itself — any `credit_card` or `loan` account *is* a debt. A dedicated "Debts" view filters to those account types.

## Credit cards

- Current balance.
- **Utilization** = `balance ÷ credit_limit` as a percentage, shown per card and aggregated across all cards.

## Loans

- Payoff progress toward `original_amount` as a trend line.
- Full **amortization schedule** — computed on demand (not stored row-by-row) by `service/loans.ts` from `original_amount` + `interest_rate` + `emi_amount`/`tenure_months` using the standard EMI formula. Shows principal/interest split for every remaining EMI and remaining tenure.
- **Prepayment-impact view**: enter a hypothetical extra payment, see interest saved / tenure reduced, without altering real data. The same function is reused as-is for the EMI calculator tab — see [calculators.md](./calculators.md).
