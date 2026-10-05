# AI Financial Planner

**Related:** [goals.md](./goals.md) · [risk.md](./risk.md) · [what-if.md](./what-if.md) · [tax-planning.md](./tax-planning.md) · [allocation.md](./allocation.md) · [provenance-lifecycle.md](./provenance-lifecycle.md)

A Level-3 planner: given the user's goals, risk tolerance, current portfolio, liquidity, debt, tax position and time horizon, it **proposes an allocation** and says why.

## Explainability

A planner that cannot show its reasoning is a black box issuing financial advice. Every proposal carries:

| Element | Content |
|---|---|
| Rationale | Why this allocation follows from the inputs |
| Assumptions | Return, volatility, inflation, tax and horizon figures used, each editable |
| Risks | What could make the proposal wrong or harmful, tied to the dimensions in [risk.md](./risk.md) |
| Alternatives considered | Other allocations weighed and why this one ranked higher |
| Sensitivity | What changes if a named assumption moves |

Figures in a proposal come from the deterministic engines (goals, risk, tax), not from the model's arithmetic. The model chooses and explains; it does not calculate.

## Hard boundaries

- **Analysis and personalised planning only.** It proposes asset-class and category-level allocations.
- **Never** a specific buy or sell instruction for a named security.
- **Never executes** anything, and has **no ability to move money**. It holds no write path to accounts, transactions or holdings.

These are enforced in the prompt layer and checked by the eval suite, not left to the model's discretion.

## Inputs

The planner works from **derived aggregates** (allocation by class, liquidity by tier, debt service, tax position, goal funding and probability, confidence mix), not raw ledger rows. **Why:** the aggregates are what the question needs, they keep the prompt small and auditable, and sending the least data that answers the question is the right default for a vault-encrypted product. The confidence mix travels with them so the planner qualifies advice that rests on estimates.

## Evaluation

The planner needs an **eval suite**: an LLM feature without one is untestable, and prompt or model changes would otherwise alter advice invisibly. The suite runs fixed portfolios and checks that outputs respect the hard boundaries, include every explainability element, stay consistent with the deterministic engines' numbers, and shift in the right direction when an input shifts.
