# Dashboard — PRD

**Related:** [../../PRD.md](../../PRD.md) · [../architecture/system-design.md](../architecture/system-design.md) (cross-module composition)

**Status:** Not started — built in Phase 3, after all four modules have at least their skeleton.

## Scope

`app/dashboard/page.tsx` composes each module's public `index.ts` — no business logic of its own, purely a summary layer:

| Module | Summary shown |
|---|---|
| Finance | Balance + recent transactions (front and center — the deepest module) |
| Mental | Latest check-in |
| Health | Latest physical metric |
| Plans | Active goals count |

Per the module-boundary rule, this is the one page allowed to call into every module's `index.ts` — no module calls another module directly.
