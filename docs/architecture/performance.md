# Rendering, Theming & Performance

**Related:** [system-design.md](./system-design.md) · [../design/components.md](../design/components.md)

## Theming (light/dark/system)

`next-themes`, follows OS `prefers-color-scheme` by default with a manual override, persisted in `localStorage`. Injects a blocking script so the correct theme applies before first paint — no flash of the wrong theme. Colors are the CSS-variable tokens from [../design/tokens.md](../design/tokens.md), so `dark:` variants are automatic everywhere.

## Rendering model

Not "everything SSR" — Next.js App Router defaults every component to a **Server Component** (renders on the server, ships zero JS for that piece). Only components needing interactivity (forms, sign-in screen, charts, animation) are `"use client"` — small, deliberate islands. Slow-to-load pieces (e.g. a chart aggregating years of data) are wrapped in `<Suspense>` with a `loading.tsx` skeleton, so Next.js streams the fast parts immediately.

## Memory/perf discipline

The app is started manually per session (`pnpm dev`/`pnpm start`) — no background service — but a session can run for hours, so this discipline matters:

| Practice | Detail |
|---|---|
| Singleton DB connection | `modules/core/db`, guarded against re-open on dev hot-reload |
| SQL-side aggregation | Balances/trends/rollups computed in SQL via Drizzle, never by pulling all rows into JS and looping |
| Pagination everywhere | Every list/table query paginated at the DB level |
| Indexes | On every column used for filtering/sorting at scale |
| Virtualized tables | Shared `DataTable` (TanStack Table + Virtual) — only visible rows mount, even at tens of thousands of rows |
| Heavy JS computation | Runs in a Node `worker_thread` if it ever comes up, so it can't block the server |
| Heavy client bundles | Loaded via `next/dynamic` (charts, the 3D house viewer, MediaPipe) — never in the initial bundle for pages that don't use them |

## Animation

CSS transitions only (Tailwind + `tw-animate-css`) — no animation library ships in the bundle. Every animation must be disabled under `prefers-reduced-motion`. No video pipeline — the only identified need is UI motion, not media playback.
