# Alerts

**Related:** every other finance doc, since this reads from all of them · [tax-planning.md](./tax-planning.md) · [debts-loans.md](./debts-loans.md) · [risk.md](./risk.md) · [goals.md](./goals.md) · [provenance-lifecycle.md](./provenance-lifecycle.md)

Route: `app/finance/alerts`, plus the prioritised list on Home and inline on the pages an alert concerns. All surfaces use the same underlying computation, so there are never two systems saying different things.

## Architecture

A finance **snapshot** is composed once per request. `service/alerts/` holds one small pure function per rule (`(snapshot) => Alert | null`), registered in `service/alerts/engine.ts`, which runs them all and returns a sorted list. Adding a rule is adding one function and registering it, with no schema or page changes.

Each alert carries `category`, `severity`, a message containing the actual figure, and a link to the relevant page or record.

| Category | Role |
|---|---|
| Auditor | Data quality: implausible balances, duplicates, uncategorised transactions, stale valuations, piled-up unconfirmed recurring periods |
| Advocate | Opportunities to do better: rate arbitrage, idle cash, tax regime verdict, which debt to repay first, unused 80C headroom |
| Compliance | Limits and deadlines: 80C/80D reached, LTCG exemption nearing, lapsed insurance, credit utilisation above threshold |

## Severity

| Severity | Meaning |
|---|---|
| `critical` | Act now: a limit breached, cover lapsed, a goal at risk of missing its date |
| `attention` | Should be looked at soon |
| `opportunity` | Something would improve if acted on, with no penalty for ignoring it |
| `informational` | Worth knowing, no action implied |

Alerts sort by severity, then by the size of the figure involved.

## Dismissal and thresholds

Dismissal is **per instance**, keyed by a content hash of the alert's triggering facts. A new instance with new numbers hashes differently, so dismissing one never hides a genuinely new issue. Thresholds (utilisation percentage, idle-cash multiple, staleness bound, concentration share) are **user-editable** in the same policy store as tax settings, not hardcoded, since sensible values differ per person.

## Computed on read

Alerts are evaluated when the user opens the app and are **not pushed** (no email, SMS or notification).

**Why:** while a user is signed out no vault key exists server-side, so nothing can read their data to evaluate a rule. For a wealth product reviewed periodically rather than minute-to-minute, surfacing alerts on open is the correct behaviour, not a limitation to engineer around.

## Wording

A rule states the **triggering fact** ("₹2.4 L idle in savings against 9 months of expenses") and does not present speculation as certainty. "You will miss this goal" is never said; "success probability is 41% on current assumptions" is. Where the triggering value is estimated, the alert says so.
