import { expect } from "vitest";
import type { AxeCore } from "vitest-axe";

/**
 * vitest-axe@0.1.0's shipped types augment a `Vi.Assertion` namespace that
 * vitest 4's `Assertion<T>` interface no longer merges with, so
 * `toHaveNoViolations` doesn't type-check even though `expect.extend`
 * registers it correctly at runtime (see vitest.setup.ts). This isolates the
 * one necessary type escape hatch instead of casting at every call site.
 */
export function expectNoAxeViolations(results: AxeCore.AxeResults): void {
  (expect(results) as unknown as { toHaveNoViolations(): void }).toHaveNoViolations();
}
