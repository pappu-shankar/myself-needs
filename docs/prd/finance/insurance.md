# Insurance

**Related:** [recurring-transactions.md](./recurring-transactions.md) (premium worklist) · [tax-planning.md](./tax-planning.md) (80C/80D flags)

`insurance_policies` table:

| Field | Notes |
|---|---|
| `type` | life, health, term, vehicle, other |
| provider/name | |
| `policy_number` | |
| `sum_assured` | |
| `premium_amount`, `premium_frequency` | |
| `start_date`, `renewal_date` | |
| notes | |
| `is_80c_eligible`, `is_80d_eligible` | Optional flags feeding [tax-planning.md](./tax-planning.md) |

A policy can optionally link to a `recurring_rules` entry for its premium, so premium due dates show up in the same "Due — not yet logged" worklist as rent/subscriptions rather than a second parallel reminder system.

A renewal date that's passed with no logged premium is one of the compliance-watch insight rules — see [insights.md](./insights.md).
