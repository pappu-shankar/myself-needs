# Accounts, Categories & Transactions

**Related:** [../../architecture/data-model.md](../../architecture/data-model.md) · [budgets.md](./budgets.md) · [debts-loans.md](./debts-loans.md)

## Accounts

Types: `checking`, `savings`, `cash`, `credit_card`, `loan`, `investment`, `receivable`.

| Field | Applies to | Notes |
|---|---|---|
| `name` | all | |
| `opening_balance` | all | Starting point for the balance calculation below |
| `interest_rate` | `credit_card`, `loan` | |
| `credit_limit` | `credit_card` | Used for utilization — see [debts-loans.md](./debts-loans.md) |
| `original_amount` | `loan` | Payoff progress = `original_amount − current_balance` |
| `emi_amount`, `tenure_months` | `loan` | Drives amortization schedule — see [debts-loans.md](./debts-loans.md) |

**Balance rule:** an account's current balance is always `opening_balance + sum of its transactions` — never a separately stored/duplicated number, so it can't drift out of sync.

**Sign convention:** asset accounts (`checking`/`savings`/`cash`/`investment`/`receivable`) carry a positive balance. Liability accounts (`credit_card`/`loan`) carry a **negative** balance representing the amount owed — `createAccount` negates whatever positive "amount owed" is entered before storing it. This is what lets a simple sum-of-balances be a correct net figure with no per-type special-casing, and it makes payments/charges fall out of the same universal formula: a *payment* toward a liability is a transfer into it (a positive amount moving a negative balance toward zero); a *charge* is an expense against it (moving it further negative). See `src/modules/finance/service/accounts.ts`.

`receivable` is the mirror image of `loan`: money someone else owes *you*, tracked the same way a loan is (opening balance = amount owed, positive since it's an asset). No dedicated fields (`interest_rate`, `emi_amount`, etc.) apply — it's a plain balance, like `cash`.

**`exclude_from_net_worth`:** opt-out, defaults to counted (`false`) for every account. The create form only exposes the toggle for `receivable` (as "Include in net worth", unchecked by default) — money owed by someone else is real, but not everyone wants an uncertain IOU inflating their headline net-worth figure. `getTotalBalance`, `getNetWorthTrend`, and the allocation report all filter it out the same way; the Accounts list itself always shows every account regardless. There's no edit-account feature yet, so this is a create-time-only choice.

## Categories

Fully custom, self-referential (`parent_category_id`) for subcategories, each tagged `income` or `expense`. No seeded starter list — opens empty with an "add your first category" prompt.

## Transactions

One table, `type` field distinguishes:

| Type | Fields | Notes |
|---|---|---|
| `income` / `expense` | `account_id`, `category_id`, `amount`, `date`, `note` | |
| `transfer` | `account_id` (from), `to_account_id`, `amount`, `date`, `note` | Excluded from category/income-expense rollups; moves money between account balances; nets to zero in overall net worth |

Indexed on `(account_id, date)` and `(category_id, date)` for fast paginated history and category rollups at scale.
