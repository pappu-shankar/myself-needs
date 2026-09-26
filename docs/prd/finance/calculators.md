# Utility Calculators

**Related:** [returns-analytics.md](./returns-analytics.md) · [debts-loans.md](./debts-loans.md)

Route: `app/finance/calculators`. Standalone, stateless — no DB reads/writes, pure client-side math reusing the exact same functions from `service/returns.ts` and `service/loans.ts` (plus a couple of pure growth-formula helpers), so sandbox numbers and real portfolio numbers are always computed the same way.

| Calculator | Inputs → Output |
|---|---|
| SIP | Monthly amount + expected annual rate + years → future value, total invested, total gain |
| Lumpsum | Principal + rate + years → future value |
| CAGR | Start value + end value + years → CAGR% |
| XIRR | Add/remove dated cash-flow rows freely → XIRR% (same solver as real holdings) |
| IRR | A list of periodic cash flows → IRR% |
| Inflation | Present value + inflation rate + years → future equivalent value, plus a "real rate of return" helper (nominal − inflation) |
| EMI / Loan | Principal + rate + tenure → EMI amount + full amortization schedule (same function as the real Debts view), plus a prepayment-impact sandbox |
