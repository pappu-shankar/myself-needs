# Utility Calculators

**Related:** [returns-analytics.md](./returns-analytics.md) · [debts-loans.md](./debts-loans.md) · [investments.md](./investments.md) · [currency-fx.md](./currency-fx.md)

Route: `app/finance/calculators`. Standalone and stateless — no DB reads or writes, pure client-side math.

**The rule that matters:** the calculators reuse the **same pure functions** that real holdings and loans use (`service/returns.ts`, `service/loans.ts`, plus a few pure growth-formula helpers). There is never a second implementation.

**Why:** two implementations drift. If the sandbox XIRR and the portfolio XIRR use different solvers or day-count conventions, the user's "what if" number and their real number disagree for reasons that look like a bug in one of them. One function means a sandbox result and a real result are computed identically, and a fix to the real figure fixes the sandbox too.

| Calculator | Inputs → Output                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SIP        | Monthly amount + expected annual rate + years → future value, total invested, total gain                                                                             |
| Lumpsum    | Principal + rate + years → future value                                                                                                                              |
| CAGR       | Start value + end value + years → CAGR%                                                                                                                              |
| XIRR       | Add/remove dated cash-flow rows freely → XIRR% (same solver as real holdings)                                                                                        |
| IRR        | A list of periodic cash flows → IRR%                                                                                                                                 |
| Inflation  | Present value + inflation rate + years → future equivalent value, plus a "real rate of return" helper (nominal − inflation)                                          |
| EMI / Loan | Principal + rate + tenure → EMI and full amortization schedule (same function as the real Debts view), plus a prepayment-impact sandbox and a refinancing comparison |

Each calculator takes a currency, defaulting to the base currency; amounts follow the `amount_minor` plus currency convention and the output is formatted with its currency, never bare. Results are labelled as projections from the inputs given — they carry no provenance because nothing is stored.
