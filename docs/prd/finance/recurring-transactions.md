# Recurring Transactions

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [insurance.md](./insurance.md) (premiums use this) · [insights.md](./insights.md) (pile-up rule)

`recurring_rules` table: `account_id`, `category_id` (or `to_account_id` for recurring transfers), `amount`, `frequency` (weekly/monthly/yearly), `start_date`, optional `end_date`, `note`.

**Manual-confirm, not silent auto-log** (deliberate choice — no reminders/notifications anywhere in this app): on opening the finance section, the app checks which rule-periods between `start_date` and today don't yet have a matching logged transaction, and surfaces them as a "Due — not yet logged" list (e.g. "Rent — Aug 2026"). Clicking one opens a pre-filled transaction form (amount/date/note all editable, e.g. if rent changed) that creates the real transaction on confirm.

Nothing is auto-created and nothing pushes a notification — it's a worklist visible only when you're already looking at finance.
