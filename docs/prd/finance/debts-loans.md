# Debts & Loans — Universal Loan Engine

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [calculators.md](./calculators.md) (EMI calculator reuses this) · [cash-flow.md](./cash-flow.md) (financing flows) · [alerts.md](./alerts.md) (utilization/rate-priority rules)

A debt is not a separate table. Any `loan` or `credit_card` account **is** the debt, and one engine models every borrowing the user can have. A dedicated "Debts" view filters to those account types.

## Where the attributes live

Loan attributes live in the 1:1 satellite **`finance_loan_terms`**; credit-card attributes live in **`finance_credit_terms`**. They are not nullable columns on `finance_accounts`.

**Why a satellite and not columns:** a table that serves savings accounts, brokerage cash and receivables as well as loans would carry five to ten columns that are null for most rows, and every new loan feature (floating-rate resets, moratoriums) would widen it again. Satellites keep the account row small and let loan behaviour grow without touching the hot-path balance query.

## The balance is not the terms

The account balance stays **ledger-derived and negative** (`opening_balance` plus non-voided transactions), exactly as for every other account. Terms are **reference data for amortization** and never feed the balance.

The engine also computes an expected outstanding principal from the terms and the payment dates. The difference between that **terms-derived outstanding** and the **ledger-derived balance** is shown as a visible **reconciliation drift** ("ledger says ₹41.2L owed, schedule says ₹40.9L"), never stored and never silently corrected.

**Why surface drift instead of reconciling it:** the two numbers disagree for real reasons — a missed or part payment, a rate reset the user has not entered, fees capitalised by the lender, a payment logged on the wrong date. Silently trusting either hides the cause. Storing the schedule's figure would create a second balance that can disagree with the first.

## Loan terms

| Field                               | Notes                                                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `original_amount_minor`             | In the account's currency                                                                                                                                                                                     |
| `rate_bps` / `rate_type`            | `fixed` · `floating`. Basis points, never a float percentage. A floating loan holds dated rate changes (`effective_from`), so the schedule reprices from the reset date and earlier periods are not rewritten |
| `tenure_months`, `emi_amount_minor` | Either may be given; the engine derives the other. A user-entered EMI that differs from the derived one is kept — it is what the lender charges                                                               |
| `first_emi_date`, `schedule_basis`  | Day-count and compounding basis; monthly reducing balance is the default                                                                                                                                      |
| `fees`                              | Processing fee, prepayment penalty rule, insurance bundled into the loan — dated, each a `computed` or `user` provenance row                                                                                  |
| `moratorium_months`                 | Interest-only or deferred-principal period before EMIs start                                                                                                                                                  |

Provenance fields apply: terms entered from a sanction letter are `verified`, typed from memory are `estimated` — see [provenance-lifecycle.md](./provenance-lifecycle.md).

## Loan types covered

| Type                                   | How the engine handles it                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, mortgage                         | Long tenure, usually floating; fees and prepayment rules matter most; the property itself is an asset account, linked only by an ID                        |
| Personal, vehicle, education, business | Standard reducing-balance EMI; education supports a moratorium during study                                                                                |
| Credit-card debt                       | Revolving: `finance_credit_terms` holds limit, statement day, due day and APR; interest accrues on the unpaid statement balance                            |
| Line of credit, overdraft              | Revolving with a limit and no fixed EMI or tenure; interest on drawn balance; no schedule, only cost-to-date and the effective rate                        |
| BNPL                                   | Short fixed instalments, often zero rate; fees carry the cost, so the effective rate is what exposes it                                                    |
| Gold loan                              | Interest-only or bullet repayment against pledged gold; the pledge is a link to the holding, and the loan-to-value ratio is computed against its valuation |
| Margin loan                            | Drawn against a portfolio; reports leverage and the price fall that triggers a margin call                                                                 |
| International loans                    | In their own currency; the account's currency is the loan's, converted for totals as in [currency-fx.md](./currency-fx.md)                                 |
| Private / family loans                 | Informal: may have no rate or no schedule at all. Terms are optional, and the account still works as a negative balance                                    |

A loan the user **lent** is the mirror case and is a `receivable` account, not a `loan`.

## Computed views

All computed on demand by `service/loans.ts` from terms and transactions, none stored row-by-row:

- **Amortization schedule** with principal/interest split for every period, remaining tenure and remaining balance.
- **Interest vs principal paid to date**, from logged payments against the schedule.
- **Effective interest rate** — the rate that equates the cash actually received with every payment and fee made (an XIRR on the loan's cash flows), which differs from the quoted rate once fees, a bundled insurance premium or BNPL charges are included.
- **Prepayment impact:** enter a hypothetical lump sum or higher EMI and see interest saved and tenure cut, without altering real data. Reuses the same function as the EMI calculator — see [calculators.md](./calculators.md).
- **Refinancing comparison:** current loan against an offer (new rate, fees, tenure) — total interest, monthly saving, and the **break-even month** after which switching pays for its fees and any prepayment penalty.
- **Payoff progress** toward `original_amount` as a trend line.

## Credit cards

- Current balance, and **utilization** = `balance ÷ credit_limit`, shown per card and aggregated.
- Statement and due days drive the due-payment worklist alongside [recurring-transactions.md](./recurring-transactions.md).
- Interest and fee charges are expense-side financing flows — see [cash-flow.md](./cash-flow.md).

## Money

Every amount is `amount_minor` plus currency, never a float. Schedule arithmetic may use floating point internally for the compounding but rounds to minor units per period, and the rounding residue goes to the final instalment so the schedule sums exactly.
