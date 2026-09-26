# Goal-Linked Investments

**Related:** [investments.md](./investments.md) · [../plans.md](../plans.md) · [../../architecture/system-design.md](../../architecture/system-design.md) (cross-module reference rule)

Cross-references the `plans` module (goals/needs) **without violating the module-boundary rule**: `investment_holdings` (and `recurring_rules`) get a nullable `linked_goal_id` — a plain ID column, not a database foreign key into `plans`' schema, since modules never share schema-level references.

A goal's detail page (in `app/plans` or `app/dashboard`) fetches its linked holdings by calling `finance.getHoldingsByGoalId()` from finance's public `index.ts` and composes them alongside the goal fetched from `plans.index.ts` — the join happens at the `app/` layer, same as the dashboard already does across modules.
