# Financial Goals

**Related:** [investments.md](./investments.md) · [risk.md](./risk.md) · [what-if.md](./what-if.md) · [ai-planner.md](./ai-planner.md) · [alerts.md](./alerts.md) · [../plans.md](../plans.md) · [../../architecture/system-design.md](../../architecture/system-design.md)

Financial goals live in finance as `finance_goals`. Non-financial life goals (learn a language, run a marathon) stay in the `plans` module; a plans goal may carry a **soft pointer** to a finance goal, a plain ID column with no foreign key, as every cross-module reference is.

**Why finance owns them:** funding a goal and its success probability need the portfolio, allocation and cash-flow data that only finance holds. Modules never import each other, so keeping goals in `plans` would force the funding and probability maths to be composed at the `src/app/` route layer, which puts financial calculation outside any module where it cannot be tested or reused by the risk engine and planner.

## Goal

| Field | Notes |
|---|---|
| `name`, `kind` | e.g. retirement, education, home, emergency fund, other |
| `target_amount_minor` + `currency` | In today's money; inflation is applied in the projection and shown |
| `target_date` | |
| `priority` | `essential` · `important` · `lifestyle` |
| `archived_at` | Archived, never deleted while history references it |

## Linked holdings

A holding or recurring rule links to a goal through a nullable `linked_goal_id`, and a holding may be split across goals by percentage. Linked holdings are valued with their provenance and staleness intact. Progress is therefore a confidence-carrying aggregate: "62% funded, of which 40% rests on estimated values".

## Funding and progress

- **Progress** = value of linked holdings, converted to the goal's currency, over the target.
- **Required monthly funding** = the contribution that closes the gap by `target_date` at the stated expected return, shown beside what is actually being contributed through linked recurring rules.
- A shortfall states the number: "₹18,000 a month required, ₹11,000 contributed".

## Success probability: light Monte Carlo

Probability of reaching the target by the date is estimated from **10,000 closed-form paths** (a draw of annual returns per path, no step-by-step simulation, so it runs in milliseconds). The return mean and volatility are **visible and editable** per goal, defaulting from the goal's linked asset mix.

**Why Monte Carlo here and nowhere else:** a probability is a distributional claim, and a deterministic projection can only state one outcome, which it cannot honestly turn into a likelihood. Everything else in the module stays deterministic with sensitivity bands. This stays inside the scope boundary in [what-if.md](./what-if.md): it answers "will this goal be met", not "what will my net worth be in 2035". The result is shown with its assumptions, never as a bare percentage.

## Prioritisation when not everything can be funded

When total required funding exceeds available surplus, goals are funded in priority order (essential, then important, then lifestyle), earliest date first within a tier. The view shows which goals are fully funded, partly funded and unfunded under that order, and what each unfunded goal would need. The user can override the order; the module never reorders silently.
