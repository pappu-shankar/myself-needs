# Institutions

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [investments.md](./investments.md) · [insurance.md](./insurance.md) · [risk.md](./risk.md) · [entities-ownership.md](./entities-ownership.md)

Banks, brokers, AMCs, insurers and custodians are first-class rows.

| Field         | Notes                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `name`        | "HDFC Bank", "Zerodha", "LIC"                                                      |
| `kind`        | `bank` · `broker` · `amc` · `insurer` · `custodian` · `other`                      |
| `country`     | Where the institution is regulated; drives geography and deposit-insurance context |
| `archived_at` | Archived, never deleted while accounts, holdings or policies reference it          |

Accounts, holdings and policies carry a nullable `institution_id`; none is required.

**Why rows and not free text:** with free text, "HDFC", "HDFC Bank" and "hdfc bank ltd" are three institutions, so "everything I have at HDFC" is unanswerable. As rows, total exposure per institution is a grouped sum, and **institution concentration risk** becomes computable: how much of net worth depends on one bank or broker failing or freezing. That feeds [risk.md](./risk.md).

Exposure is computed per institution over the consolidated, converted values, with per-currency subtotals and confidence as everywhere else.

## Seeding

`insurance_policies` already carries a free-text `provider`. Distinct providers seed the table as `insurer` institutions, and each policy is pointed at its row. Free-text matches are proposed for confirmation, not merged silently, since two similar names may be genuinely different. Accounts and holdings have no existing institution field and start unassigned.
