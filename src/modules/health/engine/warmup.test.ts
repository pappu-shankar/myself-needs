import { describe, expect, it } from "vitest";
import type { PlannedSet } from "./types";
import { BAR_WARMUP_REPS, warmupSets } from "./warmup";

const pairs = (sets: PlannedSet[]) => sets.map((s) => [s.weightKg, s.reps]);

describe("warmupSets", () => {
  it("ramps from the empty bar through 40/60/80 %", () => {
    const sets = warmupSets({ workingKg: 100, workingReps: 5, barKg: 20, isBodyweight: false });
    expect(pairs(sets)).toEqual([
      [20, BAR_WARMUP_REPS],
      [40, 5],
      [60, 3],
      [80, 2],
    ]);
    expect(sets.every((s) => s.kind === "warmup")).toBe(true);
  });

  it("takes only a single at 80 % before heavy triples and singles", () => {
    const sets = warmupSets({ workingKg: 100, workingReps: 3, barKg: 20, isBodyweight: false });
    expect(sets[sets.length - 1]).toMatchObject({ weightKg: 80, reps: 1 });
  });

  it("snaps to the step and drops sets at or below the previous one", () => {
    // 40 % = 12 and 60 % = 18 are under the bar; 80 % = 24 → 25
    expect(
      pairs(warmupSets({ workingKg: 30, workingReps: 5, barKg: 20, isBodyweight: false })),
    ).toEqual([
      [20, BAR_WARMUP_REPS],
      [25, 2],
    ]);
    // 80 % of 22.5 = 18 — nothing between the bar and the working weight
    expect(
      pairs(warmupSets({ workingKg: 22.5, workingReps: 5, barKg: 20, isBodyweight: false })),
    ).toEqual([[20, BAR_WARMUP_REPS]]);
    // dumbbells (no bar): 40 % and 60 % both snap to 20 → one set
    expect(
      pairs(
        warmupSets({ workingKg: 40, workingReps: 8, barKg: 0, stepKg: 10, isBodyweight: false }),
      ),
    ).toEqual([
      [20, 5],
      [30, 2],
    ]);
  });

  it("keeps every set at or above the bar and below the working weight", () => {
    for (const workingKg of [21, 32.5, 47.5, 61.25, 142.5, 250]) {
      const sets = warmupSets({ workingKg, workingReps: 5, barKg: 20, isBodyweight: false });
      for (let i = 0; i < sets.length; i++) {
        const kg = sets[i].weightKg as number;
        expect(kg).toBeGreaterThanOrEqual(20);
        expect(kg).toBeLessThan(workingKg);
        if (i > 0) expect(kg).toBeGreaterThan(sets[i - 1].weightKg as number);
      }
    }
  });

  it("has nothing to offer bodyweight work or a bar-only working weight", () => {
    expect(warmupSets({ workingKg: 100, workingReps: 5, barKg: 20, isBodyweight: true })).toEqual(
      [],
    );
    expect(warmupSets({ workingKg: 20, workingReps: 5, barKg: 20, isBodyweight: false })).toEqual(
      [],
    );
    expect(warmupSets({ workingKg: 15, workingReps: 5, barKg: 20, isBodyweight: false })).toEqual(
      [],
    );
    expect(
      warmupSets({ workingKg: Number.NaN, workingReps: 5, barKg: 20, isBodyweight: false }),
    ).toEqual([]);
  });
});
