# Ingestion

**Related:** [provenance-lifecycle.md](./provenance-lifecycle.md) · [accounts-transactions.md](./accounts-transactions.md) · [recurring-transactions.md](./recurring-transactions.md) · [investments.md](./investments.md) · [institutions.md](./institutions.md) · [../../roadmap/phase-9-finance-remodel.md](../../roadmap/phase-9-finance-remodel.md)

How data gets into the ledger. There is one chain, in strict preference order:

```
automatic connection  →  connector  →  file / document upload  →  manual entry
```

| Route                  | What it is                                                                                                 | Provenance                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Automatic connection   | Account-level feed of balances and transactions, no user action                                            | `source = connector`                                                 |
| Connector              | A per-institution or per-format integration the user triggers (a broker or registrar export, a market API) | `source = connector`                                                 |
| File / document upload | CSV, spreadsheet or statement PDF the user supplies                                                        | `source = import`, `method = statement_import` or `document_extract` |
| Manual entry           | The user types it                                                                                          | `source = user`, `method = manual`                                   |

Higher routes are preferred because they are less work and less error-prone. **No route is ever required.** The product works fully on manual entry alone.

**Why the fallback must be total:** global coverage cannot depend on whether a given institution exposes an integration. A user with a bank in one country, a broker in another and a family-run business account has no uniform feed, and a product that stops working when a feed is missing fails exactly the users with the most complex finances.

**Connected-account linking is a future enhancement**, gated on regulatory licensing (in India, an account-aggregator licence or a partnership with a licensed provider). Nothing built now blocks it: the provenance fields and the **import batch** are the seam it plugs into. A connector writes the same candidate rows into the same review flow with `source = connector`.

## The pipeline

```
acquire  →  parse  →  normalise  →  match & suggest  →  review  →  commit
```

Everything before **commit** produces candidates only. Candidates live in an import batch and touch no balance.

### Import batch

Every ingestion run creates an `import_batch` (source file or feed, institution, account, period covered, parser used, counts, status). Every committed row carries `import_batch_id` and `external_ref` back to its source line. This gives traceability from any number to the document it came from, and a way to void a whole batch if the wrong file was loaded.

### Review before commit

**Nothing posts without user confirmation.** The review screen shows each candidate with its suggested category, any transfer pairing, any duplicate match and its confidence; the user accepts, edits or discards per row or in bulk. Large imports are chunked and resumable, so an interrupted review is picked up where it stopped.

**Why:** a committed transaction is an immutable ledger row. A wrong auto-posted batch would have to be voided row by row, and every balance and return computed in between would have been wrong. Review makes the cheap place to fix a mistake the place before it exists.

## File import

**CSV and spreadsheet statements:** the importer sniffs the **delimiter** (comma, semicolon, tab, pipe), the encoding, the header row and where data starts, and detects the **format** — which column is date, description, debit, credit, a signed amount or balance, the date format (day-first or month-first from the data itself) and the decimal and thousands separators. Known institution layouts match by header signature; unknown ones fall to a column-mapping step whose mapping is remembered for the next file from that institution.

**PDF and document extraction:** statement PDFs, contract notes, loan sanction letters and policy documents are read to extract structured candidates. Password-protected statements are supported: the user supplies the password for that run, it is used only to open the file and is not stored. Extracted values are `method = document_extract` and carry a confidence; ambiguous fields are left blank for the user rather than guessed.

**Why extraction output is never trusted blind:** document layouts change and extraction is probabilistic. A candidate whose amounts do not reconcile to the statement's own opening and closing balance is flagged, which catches a misread line before it reaches the ledger.

## Idempotent re-runs

Importing is safe to repeat. Each row gets a stable key from the account, date, signed amount, normalised description and the institution's own reference when one exists, plus an occurrence index so two genuinely identical same-day transactions are not collapsed. A row whose key already exists in a committed batch is shown as a **known duplicate** and not re-posted.

**Why this matters:** statements overlap. A user downloads "last 3 months" in March and "last 3 months" in April, and one month appears in both. Keyed matching means the overlap is skipped, and a re-run after an interrupted review adds only what is missing.

## Transfer-pair detection

The two legs of an internal movement — money leaving one of the user's accounts and arriving in another — are matched across imported rows: opposite signs, near dates, equal amounts (or amounts consistent with a rate when the currencies differ), and a description or reference hint. A matched pair is **proposed** as a single transfer, with both legs, for confirmation. Cross-currency pairs keep both amounts on the row, so the rate is implied, never looked up — see [currency-fx.md](./currency-fx.md).

**Why:** otherwise a card payment or a move to a broker appears as an expense on one side and income on the other, inflating both and corrupting [cash-flow.md](./cash-flow.md). A pair is a suggestion, because two unrelated rows can coincide.

## Auto-categorization

Each candidate gets a **suggested category with a score**, from the user's own history first (the same normalised payee previously categorised), then rules and keyword patterns. Low-score suggestions are shown as uncategorised rather than forced.

The user's correction is **learned**: changing a suggestion records the payee-to-category mapping, which takes precedence next time. Categorization is always a visible suggestion, never silent, and categories remain the user's own — see [accounts-transactions.md](./accounts-transactions.md).

## Recurring detection

Once history is in, repeating patterns are proposed as recurring rules, for confirmation, never created silently — see [recurring-transactions.md](./recurring-transactions.md).

## Provenance of ingested data

Every ingested value carries `source`, `method`, `confidence`, `as_of`, `import_batch_id` and `external_ref` per [provenance-lifecycle.md](./provenance-lifecycle.md). `as_of` is the statement or transaction date, never the import time. A user who enters a value manually that conflicts with an imported one is shown both, not silently overwritten.
