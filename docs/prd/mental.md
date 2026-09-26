# Mental Health — PRD

**Related:** [../../PRD.md](../../PRD.md) · [../roadmap/phase-3-other-modules.md](../roadmap/phase-3-other-modules.md) · [health.md](./health.md) (general/physical medications live there instead)

**Status:** Skeleton — mood/check-in tracking was removed in favor of mental-health-specific medication tracking.

## Current scope

- **Medications** (mental-health-specific only — e.g. psychiatric medications; general/physical medications live in `health_medications` instead): `mental_medications` (name, dosage, a free-text `frequency` reference note, start/end date) + `mental_medication_logs` (one row per dose actually taken). Same shape and adherence model as `health`'s medications — "doses logged today" per active medication, not a due-worklist engine.
- `index.ts` exposes `getActiveMedicationsCount()` for the dashboard, mirroring `plans`' `getActiveGoalsCount()`.

## Deepening later

Real scope (mood tracking, journaling, triggers, any goal-linking to `plans`) is intentionally undefined until discussed with the user. Given the sensitivity of this data, revisit [../architecture/security.md](../architecture/security.md) for anything mental-health-specific before deepening.
