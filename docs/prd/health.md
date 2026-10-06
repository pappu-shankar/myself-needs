# Health (Physical) — PRD

**Related:** [../../PRD.md](../../PRD.md) · [../roadmap/phase-3-other-modules.md](../roadmap/phase-3-other-modules.md)

**Status:** Deepened past the Phase 1 skeleton — scope confirmed with the user.

## Current scope

- **Vitals**: `health_metrics`, one row per entry, `type` (weight / sleep_hours / exercise_minutes / custom) discriminates for trending; `label`/`value`/`unit`/`note`/`date` per entry. A trend chart (shared `ChartCard`, picks a metric type) plots history.
- **Medications** (general/physical — mental-health-specific medications live in the `mental` module instead, see [mental.md](./mental.md)): `health_medications` (name, dosage, a free-text `frequency` reference note, start/end date) + `health_medication_logs` (one row per dose actually taken). Adherence is "doses logged today" per active medication — a simple daily checklist, not a due-worklist engine like finance's recurring rules (see the roadmap doc's notes on why).
- `index.ts` still exposes `getLatestMetricSummary()` for the dashboard, unchanged in shape.

## Gym & training

Lives inside `health` (physical health) rather than a separate module — bodyweight, sleep and training feed each other (DOTS, readiness, body composition), and a separate module would force that composition up into the route layer. Full scope, data model and code layout: [health/gym.md](./health/gym.md).

## Deferred

Goal-linking to `plans`, richer trend analysis, and any alerting/insights layer (mirroring finance's insights engine) are still undefined — revisit if/when they come up.
