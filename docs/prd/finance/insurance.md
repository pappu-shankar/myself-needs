# Insurance

**Related:** [recurring-transactions.md](./recurring-transactions.md) (premium worklist) · [tax-planning.md](./tax-planning.md) (80C/80D flags) · [institutions.md](./institutions.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [entities-ownership.md](./entities-ownership.md)

`finance_insurance_policies`:

| Field                                       | Notes                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `type`                                      | life, health, term, vehicle, other                                                        |
| `entity_id`                                 | Whose policy it is — the insured or owning entity                                         |
| `institution_id`                            | The insurer. Nullable; see below                                                          |
| name                                        |                                                                                           |
| `policy_number`                             |                                                                                           |
| `sum_assured_minor` / `currency`            |                                                                                           |
| `premium_amount_minor`, `premium_frequency` | Premium is in the policy's `currency`                                                     |
| `start_date`, `renewal_date`                |                                                                                           |
| notes                                       |                                                                                           |
| `is_80c_eligible`, `is_80d_eligible`        | Optional flags feeding [tax-planning.md](./tax-planning.md)                               |
| `source`, `method`, `confidence`, `as_of`   | Provenance — a policy read from the document is `verified`, one remembered is `estimated` |
| `archived_at`                               | Policies are archived, never deleted while history references them                        |

**Institution seeding:** the earlier free-text `provider` field is what seeds the institutions table. Each distinct provider string becomes an institution row (insurer kind) and the policy points at it, so "everything with LIC" and concentration by insurer are answerable. See [institutions.md](./institutions.md).

**Why currency on the policy:** an NRI or a user with a foreign policy pays premiums and holds cover in a currency that is not the base. Totals convert at read time per [currency-fx.md](./currency-fx.md).

## Premiums

A policy can optionally link to a `recurring_rules` entry for its premium, so due dates appear in the same "Due — not yet logged" worklist as rent and subscriptions rather than a second reminder system. Premiums feed the committed monthly obligations in [recurring-transactions.md](./recurring-transactions.md).

## Renewal and lapse

Surfaced when the user opens finance, computed on read, with no push notification:

- **Upcoming renewal** — a `renewal_date` inside a configurable window.
- **Overdue / possible lapse** — a `renewal_date` that has passed with no logged premium. This is also a compliance-watch rule in [alerts.md](./alerts.md).
- **No cover** — an entity with dependants or loans and no life or term policy is a coverage-gap hint, not a statement of fact.

**Why "possible" lapse:** the app only knows what the user logged. A premium paid but never recorded looks identical to a lapsed policy, so the wording claims no more than the data shows.
