# Insights — Auditor, Advocate & Compliance Watch

**Related:** every other finance doc — this reads from all of them · [tax-planning.md](./tax-planning.md) (regime verdict) · [debts-loans.md](./debts-loans.md) (utilization/rate rules)

Route: `app/finance/insights`, plus inline on the pages each insight relates to. Both surfaces pull from the exact same underlying computations — never two systems saying different things.

## Architecture

`service/insights/` holds one small pure function per rule (`(financeSnapshot) => Insight | null`), registered in `service/insights/engine.ts`, which runs them all and returns a sorted list. **Adding a new rule is just adding one function and registering it** — no schema or page changes required.

Each `Insight` carries: `category` (`audit` / `advocate` / `compliance`), `severity`, a message with the actual number in it (never vague), a link to the relevant page/record. A `dismissed_insights` table lets a specific instance be dismissed so it stops resurfacing (a new instance with new numbers gets a new id, so dismissal never hides a genuinely new issue).

## Starting rules

| Category | Rule |
|---|---|
| Auditor | Implausible account balance for its type |
| Auditor | Likely-duplicate transactions (same account/amount/date) |
| Auditor | Uncategorized income/expense transactions skewing reports |
| Auditor | Investment holding with no valuation update in a long while |
| Auditor | Recurring rule with a large pile-up of unconfirmed periods |
| Advocate | Tax regime verdict (see [tax-planning.md](./tax-planning.md)) |
| Advocate | Rate-arbitrage: paying loan/credit-card interest while sitting on lower-yielding cash/FD |
| Advocate | Idle cash well above typical expenses earning ~0% |
| Advocate | Budget categories with consistent headroom worth reallocating |
| Advocate | Which debt to prioritize paying off first (highest rate) |
| Advocate | Remaining 80C headroom with months left in the financial year |
| Compliance | 80C/80D limit reached or exceeded |
| Compliance | Approaching the LTCG exemption threshold within the financial year |
| Compliance | Insurance policy past renewal date with no logged premium (possible lapse) |
| Compliance | Credit utilization above a configurable threshold (commonly ~30%) |

Thresholds live in the same editable `tax_settings`-style config as the tax module — not hardcoded, since these numbers change with policy.
