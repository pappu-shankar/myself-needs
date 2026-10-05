# Recurring Transactions

**Related:** [accounts-transactions.md](./accounts-transactions.md) · [ingestion.md](./ingestion.md) · [cash-flow.md](./cash-flow.md) · [insurance.md](./insurance.md) (premiums use this) · [debts-loans.md](./debts-loans.md) · [alerts.md](./alerts.md) (pile-up rule)

## Declared rules

`finance_recurring_rules`: `account_id`, `category_id` (or `to_account_id` for a recurring transfer), `amount_minor` / `currency` (plus `to_amount_minor` / `to_currency` for a cross-currency transfer), `frequency`, `start_date`, optional `end_date`, `note`, and provenance.

`frequency` is **weekly · monthly · quarterly · half-yearly · yearly**. Earlier docs listed only weekly/monthly/yearly; the engine has always handled the five above.

**Manual-confirm, not silent auto-log.** On opening finance, the app finds the rule-periods between `start_date` and today with no matching logged transaction and lists them as "Due — not yet logged" (e.g. "Rent — Aug 2026"). Selecting one opens a pre-filled transaction form (amount, date and note editable, e.g. when rent changed) that creates the real transaction on confirm. Nothing is auto-posted and nothing is pushed — the worklist is visible when the user is already looking at finance.

**Why no auto-posting:** a posted transaction is an immutable ledger row. Posting one the user never saw, for an amount that may have changed, creates a correction burden the app should not impose. The product also computes on read, with no server-side process that holds a vault key — see the Phase 9 decisions log.

**Period-start guard against double-posting.** A rule-period counts as logged if a matching transaction exists for that period's start, so confirming twice, or logging the payment by hand first, never creates a second row.

**Rule lifecycle:** pause, end or edit **future occurrences only**. Confirmed history is never rewritten — see [provenance-lifecycle.md](./provenance-lifecycle.md).

## Detection

Rules do not have to be typed in. Recurring patterns found in **imported transaction history** are **proposed as rules** for the user to confirm.

| Aspect       | Behaviour                                                                                                                                                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal       | Similar normalised payee, amount within a tolerance (or exactly constant), and a regular interval matching one of the five frequencies                            |
| Output       | A proposed rule with its inferred frequency, typical amount, next expected date, and a **confidence** score and the matching transactions as evidence             |
| Confirm      | Accepting creates a rule (frequency and amount editable first) with `source = user`, since the user confirmed it; the proposal itself carries `source = computed` |
| Dismiss      | A dismissed pattern is remembered and not proposed again unless new evidence changes it                                                                           |
| Never silent | Detection creates **no** rule and **no** transaction on its own                                                                                                   |

**Why proposals and not silent creation:** a false positive (a once-a-month purchase that merely looked regular) would start generating a worklist and distorting the committed cash-flow view. The same rule applies to categorization and transfer pairing in [ingestion.md](./ingestion.md): inference suggests, the user decides.

## Committed cash flow

From active rules the app shows the **committed monthly obligations** — the total that leaves before any discretionary spending — normalised to a monthly figure (a yearly premium counts one twelfth, a quarterly one a third).

- Grouped by category and by account, with loan EMIs, insurance premiums, rent, subscriptions and SIPs distinguished.
- Per currency, converted into the base currency with the audit shape from [currency-fx.md](./currency-fx.md).
- Compared with income to show how much of it is already spoken for. This is the operating-side companion to [cash-flow.md](./cash-flow.md).
