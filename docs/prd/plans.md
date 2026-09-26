# Plans (Needs/Goals) — PRD

**Related:** [../../PRD.md](../../PRD.md) · [finance/goal-linked-investments.md](./finance/goal-linked-investments.md) · [../roadmap/phase-3-other-modules.md](../roadmap/phase-3-other-modules.md)

**Status:** Deepened past the Phase 1 skeleton — scope confirmed with the user.

## Current scope

- **Goal types**: `type` is `financial` or `other` (non-financial goal/habit). Progress source differs by type — see below.
- **Prioritization**: `priority` is `must_have` / `important` / `aspirational`. The goal list is sorted by priority rank first, then newest-created within a tier; purely a display/ordering signal, not a queue.
- **Financial goal progress**: derived, not stored — computed at the `app/` layer from `finance.getHoldingsByGoalId(goal.id)` against the goal's `targetAmount`. `plans` itself never imports from `finance` (see the cross-module note below).
- **Non-financial goal/habit progress**: a manually-updated `progressPercent` (0–100), edited inline from the goals list — no separate detail page needed for this.
- `db/schema.ts` → `db/queries.ts` → `service.ts` → `actions.ts` → `index.ts` → one list+form page, per the Phase 1 skeleton shape (kept flat; hasn't grown enough to warrant the `schema/`/`queries/`/`service/`/`actions/` split finance and health use).
- `index.ts` still exposes `getActiveGoalsCount()` for the dashboard and `getGoalById()`, unchanged in shape.

## Cross-module note

`finance` links investments/recurring rules to a goal via a plain `linked_goal_id` (see [finance/goal-linked-investments.md](./finance/goal-linked-investments.md)) — `plans` itself never imports from `finance`; the goals page composes both at the `app/` layer.

## Deferred

Editing a goal's type/priority/target after creation (only progress is editable post-creation, matching the append-only-plus-targeted-edit pattern used elsewhere), richer goal detail pages, and any insights/nudge layer are still undefined — revisit if/when they come up.
