# Accessibility

Applies to every module, not bolted on at the end.

**Related:** [components.md](./components.md) · [tokens.md](./tokens.md)

| Practice | Detail |
|---|---|
| Radix primitives | shadcn/ui's Radix-based primitives give keyboard nav, focus trapping, ARIA roles by default — use them rather than hand-rolled interactive components |
| Semantic HTML | Real heading hierarchy per page; `<label>` on every form field; `<table>` (via `DataTable`) for tabular data, not styled `<div>`s |
| Never color-alone | Finance gains/losses show a +/− sign and icon in addition to green/red; chart series get distinct shapes/patterns, not just hue |
| Keyboard | Visible focus states and full keyboard operability on every interactive element (nav, forms, tables, chart tooltips where feasible) |
| Form errors | Linked to their field via `aria-describedby`, plus a summary on failed submit |
| Contrast | WCAG AA minimum baked into the token file's color choices |

## Tooling

- `eslint-plugin-jsx-a11y` in the lint config — catches issues at write-time.
- `vitest-axe` (or `@axe-core/playwright` if end-to-end tests are added later) run against core pages as part of the test suite.
