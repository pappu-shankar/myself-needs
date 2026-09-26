# Tax Planning (India, Estimates Only)

**Related:** [investments.md](./investments.md) (capital gains reuses the cash-flow ledger) · [insurance.md](./insurance.md) (80C/80D) · [insights.md](./insights.md) (compliance-watch rules)

Not a filing tool. Three concrete pieces, all built on data that already exists, all driven by **editable reference tables** (`tax_settings`) rather than hardcoded rates, since tax rules change with each budget.

## 80C utilization

Sums, for the current financial year (April–March), contributions to PPF/NSC/SSY holdings, ELSS mutual fund holdings (flagged `is_elss`), tax-saver FDs (flagged `is_tax_saver`), and 80C-eligible insurance premiums — shown against the configured limit in `tax_settings`.

## Capital gains estimate

Matches each redemption cash-flow against its earliest unconsumed contribution cash-flows **FIFO** (first-in-first-out) directly over the existing `investment_cash_flows` ledger — no new schema needed, since each contribution *is* already a dated "purchase lot." Classifies each matched gain as LTCG or STCG based on holding period vs. configured thresholds in `tax_settings` (equity/equity-MF and debt/gold thresholds differ and have changed in recent budgets — configurable, not hardcoded), and estimates tax owed at configured rates.

## Old vs. new regime — a clear verdict

Using income transactions, 80C utilization, and health-insurance premiums (80D), applies both regimes' slab rates (from `tax_settings`, editable) and states outright which regime is better and by how much (e.g. "Old regime saves you ₹18,400 this year"), plus the one-line reason why. Computed from actual numbers each time, not a generic rule of thumb — flips automatically as deductions/income change year to year. Framed clearly in the UI as an estimate for personal planning, not a substitute for a CA/filing software.
