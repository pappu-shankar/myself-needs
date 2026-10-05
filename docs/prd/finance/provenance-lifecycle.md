# Provenance, Confidence & Record Lifecycle

**Related:** [ingestion.md](./ingestion.md) · [accounts-transactions.md](./accounts-transactions.md) · [investments.md](./investments.md) · [net-worth.md](./net-worth.md)

Data arrives from a connected feed, an imported statement, an extracted document, a market quote, an accrual calculation, or a person typing it in. A number that does not say which is a number the user cannot calibrate against.

## Provenance

Every value-bearing row carries:

| Field | Values |
|---|---|
| `source` | `user` · `import` · `connector` · `market` · `computed` |
| `method` | `manual` · `statement_import` · `document_extract` · `api_quote` · `accrual` · `derived` · `user_estimate` · `unknown` |
| `confidence` | `verified` · `reported` · `estimated` · `unknown` |
| `as_of` | When the value was true, not when the row was written |
| `import_batch_id`, `external_ref` | Traceability back to a source document or feed record |

So a UI can distinguish:

```
₹12,45,000   HDFC Bank · connected · verified · 2 hours ago
₹2,40,00,000 You · manual estimate · 6 Oct 2026
250 g        You · manual · verified
```

`derived` covers values the app computed from other records rather than observed — a government-scheme balance rolled forward from its contribution ledger, or a net-invested fallback for an instrument with no market price. It is distinct from `accrual`, which is specifically interest compounding at a known rate, and it always pairs with `confidence: estimated`.

**`unknown` is a real value, not a gap to fill.** It exists so that migrating pre-existing data never fabricates provenance. Rows created before provenance was tracked genuinely cannot be distinguished — a refreshed NAV and a hand-typed price look identical in the old schema — and claiming otherwise would be worse than admitting it.

**`as_of` is never defaulted to "now"** for historical rows. Back-stamping years of history as freshly observed destroys exactly the signal the field exists to carry.

## Confidence on computed values

Confidence propagates. An aggregate is not more trustworthy than its weakest contributor, and a single estimated holding does not make a whole net-worth figure an estimate either — so aggregates report both:

```
₹4.2 Cr — 71% verified, 29% estimated
```

Every aggregate return type carries `{ minor, currency, confidence, mix: [{ confidence, minor }] }`, where `confidence` is the weakest contributor and `mix` is the breakdown by value. Net worth, allocation, risk scores and goal progress all surface it.

## Staleness

A holding with no valuation, or one older than the configured bound, is never presented as if current. It shows a missing or stale state, with the date of the last known value.

## Record lifecycle

Correcting a mistake must not silently rewrite reported history. Policy differs by what a record *is*:

| Record class | Policy |
|---|---|
| Transactions, investment cash flows | **Immutable + void/reversal.** `voided_at`, `void_reason`, `superseded_by_id`. A correction is a new row pointing at the voided one. |
| Accounts, holdings, policies, categories, entities, institutions | **Edit-in-place + archive.** `archived_at`. Deletion refused while history references the row. |
| Valuations | **Dated replacement, revisions retained.** A same-day re-entry supersedes rather than overwrites, so a bad price stays auditable. |
| Budgets | **New effective period.** Prior periods stay queryable. Already the existing behaviour. |
| Recurring rules | **Pause / end / edit future occurrences only.** Confirmed history is never rewritten. |

Net effect on the schema: `superseded_by_id` belongs on the two ledger tables, not on everything.

**Why ledger rows are immutable:** an edited cash flow silently changes a reported XIRR, and an edited transaction silently changes a historical balance and every report derived from it. A user who corrects a typo should not discover that last quarter's return moved. A void plus a replacement makes the change visible and reversible.

**Void must be honoured everywhere.** Account balances are computed from both legs of a UNION ALL over transactions; a void filter applied to one leg and not the other leaves a voided transfer still crediting its destination, overstating balances permanently. The test for this asserts that with every row voided, every monetary query returns zero.
