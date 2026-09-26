# Returns & Analytics (CAGR / XIRR / IRR)

**Related:** [investments.md](./investments.md) · [calculators.md](./calculators.md) (reuses these functions) · [../../architecture/system-design.md](../../architecture/system-design.md)

Computed uniformly from the `investment_cash_flows` ledger at any level (single holding, one account, or the whole portfolio) by concatenating that level's cash flows plus its current total value as a final "as of today" inflow.

| Metric | When | Implementation |
|---|---|---|
| **XIRR** | Default "your returns" number everywhere — correctly handles real, irregularly-dated cash flows (SIPs, top-ups, partial withdrawals, dividends), same as the mutual-fund industry reports it | `xirr` npm package (Newton-Raphson solver) — not hand-rolled, since the numerics (non-convergence, all-same-sign cash flows) are easy to get subtly wrong |
| **IRR** | Same idea assuming evenly-spaced periods rather than real dates; included for explicit periodic-model comparisons | Direct closed-form/Newton solve, no extra dependency |
| **CAGR** | Single start value/date + end value/date, no interim cash flows (e.g. "this FD/lumpsum grew from X to Y over N years") | Simple closed-form formula |

All three live in `modules/finance/service/returns.ts` as pure functions, so the same code powers both the real per-holding/portfolio numbers **and** the standalone calculator page.
