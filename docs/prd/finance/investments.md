# Investments

**Related:** [returns-analytics.md](./returns-analytics.md) · [net-worth.md](./net-worth.md) · [tax-planning.md](./tax-planning.md) (capital gains reuses the cash-flow ledger) · [goal-linked-investments.md](./goal-linked-investments.md)

Every instrument type — equity, international equity, mutual funds (domestic & international), bonds, gold, FD, RD, chit funds, government schemes, other physical assets — is modeled the same way: one `investment_holdings` row (`type`, `name`, `account_id` or standalone) plus a shared `investment_cash_flows` ledger.

## The cash-flow ledger

`investment_cash_flows`: `holding_id`, `date`, `amount` (negative = money in/contributed, positive = money out/received), `flow_type` (contribution, redemption, dividend, interest, maturity).

This one mechanism covers every instrument type without bespoke schema per type, and is what makes XIRR/IRR/CAGR computable uniformly — see [returns-analytics.md](./returns-analytics.md).

## Per-type behavior

| Type | Valuation | Notes |
|---|---|---|
| Equity, international equity, mutual funds (domestic & international), gold | `units` + `investment_valuations` (`holding_id`, `date`, `price_per_unit`); current value = `units × latest price` | Every holding can be updated manually. **Domestic mutual funds only** get a "Refresh NAV" button — see below. |
| Other assets (jewellery, silver, and anything else without a dedicated type) | Same as gold — `units` (e.g. grams) + `investment_valuations`; current value = `units × latest price` | Always manual — no price provider exists for this catch-all type. |
| Bonds | Cash flows = purchase (out) + coupon payments + maturity redemption (in) | Current value = manually entered mark-to-market or face value if held to maturity |
| FD / RD | Cash flows = deposit(s) (out) + maturity payout (in) | Value between now and maturity computed from stored `interest_rate` (accrual estimate), not manual entry |
| Chit funds | Simple cash flow log: each month's contribution (out) + any dividend/discount or final payout (in) | No bid-tracking mechanics modeled — deliberately simplified |
| Government schemes | Same cash-flow mechanism | See "Scheme templates" below |
| Dividends | Not a holding type — a `dividend` cash-flow entry against the paying holding | Flows naturally into that holding's (and the portfolio's) return calculation |

## Domestic mutual fund NAV refresh

`price-providers/mutual-fund-nav.ts` calls the free, no-key AMFI/`mfapi.in` NAV API **only on manual click** (never a background poll) and inserts a new `investment_valuations` row.

Equity, international equity, gold, and other assets stay manual — no reliable free public data exists for those (NSE/BSE has no official free API; international equity's free options are unofficial/low-quota; gold has no solid free API; "other assets" is a catch-all with no price source at all). All sit behind the same `PriceProvider` interface, so a provider for any of them (including a paid API key) can be added later without touching the holdings schema, UI, or any calculation.

## Scheme templates (government schemes)

A `scheme_templates` table ships pre-seeded with common Indian schemes (PPF, EPF, NSC, SSY, SCSS, KVP, Post Office schemes, etc.) — name, typical lock-in period, interest type/rate (editable, since govt rates get revised, e.g. quarterly for PPF). You opt in per scheme by creating a holding against a template, skip any you don't hold, or add a custom one. The template only supplies reference info (lock-in countdown, current notified rate) shown alongside the holding — the holding itself uses the same cash-flow mechanism as everything else.

## International currency (deferred)

No international holdings exist yet. The account/holding types support them, but the FX-handling decision (convert-at-entry vs. track-original-currency + exchange rate) is deferred until an international holding actually exists — nothing already built needs to change when that decision is made.
