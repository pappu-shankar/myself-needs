# Shared Components & Motion

**Related:** [tokens.md](./tokens.md) · [accessibility.md](./accessibility.md) · [../architecture/performance.md](../architecture/performance.md)

## Shared components (`components/ui`, built on shadcn/ui + Radix primitives)

| Component | Notes |
|---|---|
| `PageHeader` | Consistent title/subtitle/actions across every module page |
| `Card` | Soft elevation, the base container everywhere |
| `StatTile` | Dashboard/report numbers, smooth count-up animation via Motion rather than numbers just appearing |
| `DataTable` | TanStack Table + Virtual; right-aligned numeric columns; muted secondary metadata (date/category) on its own line, not crowding the primary value |
| `FormField` | Label + error + hint, consistent across every form in every module |
| `EmptyState` | A real designed state with an icon and a clear next action — never bare "no data" text |
| `ChartCard` | Wraps a Recharts chart with consistent title/legend/empty-state handling |

One consistent icon set throughout (Lucide, shadcn/ui's default) — never mixed with another icon style.

## Motion as polish, not decoration

- Subtle hover/press states on every interactive element.
- Smooth Suspense-boundary transitions.
- Skeleton loaders shaped like the real layout, not generic spinners.
- Always respects `prefers-reduced-motion`.

## Charts

Use the `dataviz` skill when building any chart — palette and accessibility guidance so finance, health, and mood charts all read as one consistent system.

## Layout

Persistent sidebar/topbar nav across the 4 modules + dashboard. Every module page follows `PageHeader` + content-area structure.

## Build order note

Before building the finance pages, use the `design` skill to mock up the dashboard and one finance list/table page as a visual reference for "premium" — cheaper to iterate on look-and-feel there than in code.
