# Phase 5 — Open-source release readiness

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [../../PRIVACY.md](../../PRIVACY.md) · [../../LICENSE](../../LICENSE)

The user confirmed this project's distribution model: **open-source, self-hosted by others** — not a hosted multi-user product. Each person who runs it gets their own local, encrypted install; the project itself operates no service and collects nothing from anyone. That framing decides which of the usual "going public" checklist items actually apply here (see Notable decisions below).

| # | Task | Status |
|---|---|---|
| 1 | Choose and add a LICENSE | Done — AGPL-3.0, chosen explicitly by the user |
| 2 | Rewrite `README.md` as a real project pitch (was unedited `create-next-app` boilerplate) | Done |
| 3 | `PRIVACY.md` — factual disclosure of what the app does/doesn't send over the network | Done |
| 4 | Proofreading pass — top-level docs (`PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `DESIGN.md`, `AGENTS.md`) | Done — fixed a factual error (docs said "Radix primitives," the app actually uses Base UI) and stale status tables in `PRD.md`/`ROADMAP.md` that hadn't been updated since Phases 2–4 landed |
| 5 | Terms of Service | N/A — no hosted service is operated; see `PRIVACY.md`'s framing |
| 6 | Proofreading pass — in-app UI copy (form labels, hints, error messages across every page/form file) | Done — 54 files reviewed across 3 parallel passes (finance core, finance reports/tax/calculators/insights, health/mental/plans/dashboard/unlock); see decisions below for what was actually found |
| 7 | `CONTRIBUTING.md` — how an outside contributor should propose changes, coding conventions pointer | Done |
| 8 | `SECURITY.md` — responsible-disclosure process for reporting a vulnerability, given this handles sensitive personal data | Done |
| 9 | `CODE_OF_CONDUCT.md` | Done — Contributor Covenant v2.1, the standard template |
| 10 | Marketing/landing-page copy beyond the README pitch (a dedicated project site, App-Store-style listing, etc.) | Done as reusable content — see [../content/marketing-copy.md](../content/marketing-copy.md); no landing page exists yet to deploy it into |

## Notable decisions

- **No Terms of Service, and this is a real distinction, not an oversight.** T&C and a traditional privacy policy exist to govern the relationship between a company operating a service and the people using it. This project has neither — there's no server, no account, no data the maintainers can see. `PRIVACY.md` documents what the *code* does (network calls, storage) rather than promising anything about a service that doesn't exist.
- **AGPL-3.0 over MIT/Apache-2.0** — the user's explicit choice, specifically to prevent a scenario the self-hosted distribution model makes possible: someone taking this code, running a modified version as a hosted service for other people, and keeping their changes closed. AGPL's network-use clause closes that gap; a permissive license wouldn't.
- **`SECURITY.md` routes reports to GitHub's private vulnerability reporting**, not a personal email address, to avoid publishing anyone's contact details in a public repo while still giving reporters a private channel.
- **The UI copy pass turned up two real bugs, not just wording polish** — a `<select>` in `recurring-rule-form.tsx` was rendering the literal string "Half_yearly" (raw underscore) instead of "Half-yearly", and `insights-banner.tsx` was displaying raw lowercase category values ("audit"/"advocate"/"compliance") instead of the proper labels the full `/finance/insights` page already used — both fixed. The pass also added missing hints expanding finance jargon (CAGR, SIP, EMI, XIRR, LTCG/STCG, Section 87A) that had no explanation anywhere in the UI, consistent with the app's existing pattern (e.g. the 80C/80D hints in `insurance-form.tsx`) of not assuming domain knowledge.
- **Marketing copy was written as reusable content, not wired into a page** — there is no landing page in this repo (it's an app, not a marketing site), so `docs/content/marketing-copy.md` holds ready-to-use taglines, a GitHub "About" blurb, and a longer pitch for whenever one exists, rather than inventing a page to hold it.
