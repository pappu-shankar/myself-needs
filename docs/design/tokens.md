# Design Tokens

**Related:** [components.md](./components.md) · [accessibility.md](./accessibility.md) · [../architecture/performance.md](../architecture/performance.md) (theming)

## Direction

Premium, not default shadcn/Tailwind out-of-the-box. Lives in `lib/tokens.ts` + Tailwind config + CSS variables (shadcn/ui theming convention).

| Token | Choice | Rationale |
|---|---|---|
| Color | A considered neutral scale + one deliberate accent color | Not shadcn's default zinc/slate-and-blue |
| Spacing | Consistent scale, generous whitespace | Cramped density reads as generic, not premium |
| Radius/shadow | Restrained, soft elevation system on cards | Harsh borders read as a template, not a designed product |
| Light/dark | Both designed on their own terms from day one | Not one mode inverted from the other — this is a daily-use tool |

## Typography

One high-quality sans-serif (Inter or Geist) via `next/font` (self-hosted, no external font-loading jank).

**Signature detail:** every number in the app uses **tabular/lining numerals**. Columns of financial figures aligning perfectly is a large part of what makes a finance app read as premium vs. generic — apply via the numeric font-feature setting on every `StatTile`, `DataTable` cell, and chart label.
