# Phase 6 — Cross-module global search

**Related:** [../../ROADMAP.md](../../ROADMAP.md)

The user picked this as the first feature from a broader ideation list (deepen stubbed modules / data safety / QoL UX / bigger scope expansion) — chosen for being well-scoped and needing no architecture changes. A Cmd/Ctrl+K palette, reachable from any protected page, that live-searches across all four modules and navigates straight to the right page.

| # | Task | Status |
|---|---|---|
| 1 | Shared `SearchResult` contract (`src/types/search.ts`) | Done |
| 2 | Per-module search (finance, health, plans, mental) — query + service + barrel export + unit test | Done — built in 4 parallel background agents against the shared contract, no coordination needed between them |
| 3 | Composition layer (`src/app/(protected)/search-action.ts`) | Done |
| 4 | Base UI `Autocomplete` wrapper (`src/components/ui/autocomplete.tsx`) | Done — first use of Base UI's Autocomplete/Combobox family in this codebase |
| 5 | Search palette UI + keyboard shortcut wiring into `sidebar-nav.tsx` | Done |

## Notable implementation decisions

- **Four independent background agents built each module's search function in parallel**, following the pattern established in earlier phases (Phase 4's test-writing, Phase 5's UI copy pass) — the module boundary is naturally the parallel-work boundary here too, since each module's search function touches only its own schema and has zero dependency on the others. The composition layer and UI were built afterward by one thread, since that part doesn't decompose (it depends on all four barrels existing and is one coherent UI unit).
- **No per-entity detail routes exist anywhere in this app** (e.g. no `/finance/transactions/:id`), so a transaction/recurring-rule/account match can only link to its general page (`/finance`), not deep-link to the specific row. Accepted as a real v1 limitation rather than building detail routes just to support search — that's a separate, much larger feature.
- **Base UI's `Autocomplete` (same family as its `Combobox`) turned out to support a fully server-driven, controlled items model** via `mode="none"` (items are not filtered by the primitive itself) plus controlled `items`/`value`/`onValueChange` — confirmed by reading its actual `.d.ts` files rather than guessing, before committing to it over a hand-rolled `Dialog` + list. Grouping works by passing `items` as an array of `{ items: [...] }` group objects to `Root`, with `List`'s `children` accepting a render-prop function invoked per group.
- **The search query persists across closing and reopening the palette** (a deliberate choice, not an oversight) — an earlier draft reset `query`/`results` on open via a `useEffect`, which the React Compiler's lint rule flagged as a real anti-pattern (synchronous `setState` inside an effect body causing cascading renders). Removing that reset both fixed the lint error and produced a small UX improvement: most command palettes (VSCode's included) remember your last query rather than discarding it.
- **The debounced search effect only ever calls `setState` inside the `setTimeout` callback**, never synchronously in the effect body itself — this is what the lint rule actually requires (calling setState from a callback in response to an external event is fine; calling it synchronously during the effect's own execution is not).
- **Results per type are capped at 5** to keep the palette usable; an empty/whitespace query short-circuits before any DB query runs, both client-side (skips the debounced fetch entirely) and server-side (`searchAction` returns `[]` immediately) as a belt-and-suspenders pair.
