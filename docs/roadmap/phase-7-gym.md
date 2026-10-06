# Phase 7 — Gym & training (inside `health`)

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [../prd/health/gym.md](../prd/health/gym.md)

The user asked for gym tracking in the physical-health module, referencing openGym, with every advanced pack on top (smarter programming, recovery & analytics, body composition, camera rep counter), built in phases.

| # | Task | Status |
|---|---|---|
| 1 | Foundation — PRD, all gym tables in one migration (`0025_health_gym`), client-safe `gym-types.ts`, engine and importer contracts, MIT exercise catalog + build script, third-party notices, isomorphic-import architecture rule | Done |
| 2 | Wave 1 (parallel agents) — programming engine (progression, e1RM/PRs, RPE, warm-ups, plates, 5/3/1, blocks); analytics engine (effort, volume landmarks, ACWR, readiness, body composition, DOTS/strength standards, calendar); data layer (library/routines/templates/schedule/programs/TMs/settings and workouts/history/vitals/measurements/readiness/landmarks); importers (Strong, Hevy, FitNotes, Apple Health, plan file, backup); camera rep counter (MediaPipe, 9 movements); body map + heatmap | Done |
| 3 | Composition services — session prescriptions (5/3/1 → target-RPE autoregulation → progression policy, then block modifiers), stats, exercise overview, workout summary, body overview, readiness, hub overview, 13 insight rules, global search, dashboard tile, nav | Done |
| 4 | Wave 3 (parallel agents) — pages: live workout + history; routines/plan/programs; library; stats/body/tools + readiness; import/export; hub + settings by the coordinator | Done |
| 5 | Integration — live walkthrough against a throwaway `data-dev` vault (template → plan override → hub preview → check-in → start with weigh-in → log sets → finish → summary → stats/body/tools → discard, at desktop and 375 px), lint, typecheck, full test suite, production build | Done — all gym checks green; the build's type-check step is blocked only by unrelated uncommitted finance work at the time |

## Notable implementation decisions

- **All gym tables land in one migration**, written before any parallel work starts, so no two agents ever generate competing migrations.
- **The exercise catalog is seeded at runtime, not by a migration.** `service/gym/catalog.ts` inserts any catalog key missing from `health_exercises`, so a newer dataset only needs the JSON regenerated; tests seed on demand instead of paying for 1,324 inserts per test database.
- **`engine/` and `importers/` are pure and isomorphic** (checked by `architecture.test.ts`), so the same code computes prescriptions on the server and runs the plate calculator / file parsing in the browser. Importers parse in the browser because an Apple Health export can be hundreds of MB; only normalized records reach the Server Action.
- **Bodyweight stays in `health_metrics`.** A workout's weigh-in is a normal weight entry, so the existing trend chart, the dashboard and the gym's DOTS/body-composition math all read one source.
- **Prescription precedence lives in one place** (`service/gym/session-plan.ts`): a `wendler_*` entry with an active 5/3/1 program and a training max takes its loads from the TM (bumped per cycle from logged AMRAPs, derived, never stored); otherwise a target RPE autoregulates from the best recent e1RM; otherwise the progression policy decides. An active training block then applies its weekly set ramp / deload to standard entries. The session stores the resulting target snapshot, so later judging uses what was actually asked.
- **A first double-progression session starts at the bottom of the rep range** and, when no starting load is set (fresh templates), its reason asks for "a weight you could do for N + 2 reps" — found in the live walkthrough, where the first version prescribed the top of the range and the preview mislabelled unloaded sets as "bodyweight".
- **Completing a set carries its weight down** to later not-yet-done sets of the same kind that have no weight (`fillEmptyWeightsAfter`) — also found live: typing the load once per exercise is what every mainstream tracker does.
- **The weekly-goal insight stays quiet for someone who hasn't trained in 28 days** — the first version nagged a brand-new vault with "0 of 3 sessions".
- **No push notifications while the app is closed** — local-only, no push server; rest-timer alerts use the Notification API while the tab is open, and a missed planned session surfaces as an insight.
- **Parallel agents hit the API session limit twice**; each was resumed with its context (per AGENTS.md's retry rule) rather than restarted, and finished its own scope.

## Follow-up (2026-10-05)

| # | Task | Status |
|---|---|---|
| 6 | Pounds (display/input unit; storage stays kg; lb load steps and plates), cardio speed/pace, weight changes coloured toward/away from goal, hard-sets-only muscle map | Done — verified live in lb |
| 7 | Camera: voice coach, hands-free auto-log, on-device set replay (slow-mo + skeleton), progress photos (guided capture, stored encrypted in the vault, pose-aligned compare) — migration `0026_health_gym_units_photos` | Done — needs real-camera tuning |
| 8 | Phone access over Tailscale (`tailscale serve` + identity-checked host exception in `src/proxy.ts`) | Pending the owner's approval — changing the request guard was blocked by the auto-mode safety check |
