# Accounts, Categories & Transactions

**Related:** [../../architecture/data-model.md](../../architecture/data-model.md) · [entities-ownership.md](./entities-ownership.md) · [currency-fx.md](./currency-fx.md) · [provenance-lifecycle.md](./provenance-lifecycle.md) · [institutions.md](./institutions.md) · [debts-loans.md](./debts-loans.md) · [cash-flow.md](./cash-flow.md)

## The hierarchy

```
Entity  →  Institution  →  Account  →  Holdings / Transactions
```

An account belongs to an entity (whose money it is) and optionally to an institution (where it is held). Both are plain nullable references on the account; an account with neither belongs to **Self** at an unspecified institution.

## Accounts

One `finance_accounts` table with a `kind` discriminator, not separate asset and liability tables.

**Why one table:** `finance_accounts.id` is referenced by transactions (both legs), recurring rules (both legs) and holdings. Splitting forces either a polymorphic `(account_id, kind)` reference carrying no foreign key — which forfeits the `PRAGMA foreign_key_check` that guards every migration — or re-pointing all historical transactions into a new id space. The discriminator costs nothing by comparison.

| Field | Applies to | Notes |
|---|---|---|
| `name` | all | |
| `kind` | all | `asset` · `liability` |
| `type` | all | `checking`, `savings`, `cash`, `credit_card`, `revolving_credit`, `loan`, `investment`, `receivable` |
| `entity_id` | all | Whose money it is — see [entities-ownership.md](./entities-ownership.md) |
| `institution_id` | all | Where it is held — nullable |
| `currency` | all | Pinned here, so every leg on the account shares it |
| `opening_balance` | all | `amount_minor` + the account's currency |
| `liquidity` | all | `liquid` · `semi_liquid` · `illiquid` |
| `normal_balance` | all | `debit` · `credit` — see the sign convention below |
| `exclude_from_net_worth` | all | Opt-out, defaults to counted |
| `archived_at` | all | Accounts are archived, never deleted while history references them |

Type-specific attributes live in 1:1 satellite tables rather than as nullable columns on every row: `finance_loan_terms` (original amount, rate, tenure, EMI, first EMI date, schedule basis) and `finance_credit_terms` (credit limit, APR, statement day, due day). See [debts-loans.md](./debts-loans.md).

`revolving_credit` covers facilities that draw against a limit with no fixed EMI — line of credit, overdraft, BNPL, margin loan. They take `finance_credit_terms` like a credit card rather than `finance_loan_terms`, because there is no amortization schedule to compute. Rates are stored as integer basis points throughout, for the same reason ownership stakes are.

**Balance rule:** an account's current balance is always `opening_balance + sum of its non-voided transactions` — never a separately stored number, so it cannot drift. Unchanged from the original design and still correct.

**Sign convention:** asset accounts carry a positive balance; liability accounts carry a **negative** balance representing the amount owed. A payment toward a liability is a transfer into it (moving a negative balance toward zero); a charge is an expense against it (moving it further negative). One formula, no per-type special-casing, and a plain sum of balances is a correct net figure.

`normal_balance` makes that convention **explicit rather than inferred from `type`**, with a database constraint tying the two together. The sign itself does not change — it is baked into every historical transaction, and flipping it would be a data mutation with no safe inverse.

`receivable` is the mirror of `loan`: money owed *to* the user, positive because it is an asset. It is the one type whose create form exposes `exclude_from_net_worth`, since an uncertain IOU need not inflate a headline figure.

## Institutions

Banks, brokers, AMCs, insurers and custodians are first-class rows rather than free text repeated across accounts, so "everything at HDFC" is answerable and concentration risk by institution is computable. See [institutions.md](./institutions.md).

## Categories

Fully user-defined, self-referential (`parent_category_id`) for subcategories, each tagged `income` or `expense`. No seeded starter list.

Imported transactions are auto-categorized with a confidence score and a user-visible suggestion; the user's correction is remembered for future matches. Categorization is always a suggestion, never silent — see [ingestion.md](./ingestion.md).

## Transactions

One table; `type` discriminates.

| Type | Fields | Notes |
|---|---|---|
| `income` / `expense` | `account_id`, `category_id`, `amount_minor`, `currency`, `date`, `note` | |
| `transfer` | `account_id` (from), `to_account_id`, `amount_minor`/`currency`, `to_amount_minor`/`to_currency`, `date`, `note` | Excluded from category and income/expense rollups; nets to zero in net worth |

**Cross-currency transfers carry both legs.** The rate that actually applied is implied by the two amounts and never needs a rate-table lookup — see [currency-fx.md](./currency-fx.md).

**Transfers are not spending.** Moving ₹10L from a bank to a broker, or funding an FD, must never appear as an expense. Beyond explicit user-entered transfers, imported transactions are matched into transfer pairs automatically and presented for confirmation — see [ingestion.md](./ingestion.md).

Transactions are **immutable once posted**. A correction is a void plus a replacement row, so reported balances and returns never change silently — see [provenance-lifecycle.md](./provenance-lifecycle.md).

Indexed on `(account_id, date)`, `(category_id, date)`, `(to_account_id, date)` and `(date)` for paginated history and rollups at scale.
