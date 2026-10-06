import { describe, expect, it } from "vitest";
import { applyWeekModifiers, blockModifiers, programWeek } from "./periodization";
import type { PlannedSet, WeekModifiers } from "./types";

const planned = (kind: PlannedSet["kind"], weightKg: number | null, reps = 8): PlannedSet => ({
  kind,
  weightKg,
  reps,
  durationSec: null,
  distanceKm: null,
});
const warm = planned("warmup", 20, 10);
const work = (weightKg: number | null = 60) => planned("working", weightKg);

describe("programWeek", () => {
  it("is 1-based from the start date and ≤ 0 before it", () => {
    expect(programWeek("2026-01-05", "2026-01-05")).toBe(1);
    expect(programWeek("2026-01-05", "2026-01-11")).toBe(1);
    expect(programWeek("2026-01-05", "2026-01-12")).toBe(2);
    expect(programWeek("2026-01-05", "2026-01-04")).toBe(0);
    expect(programWeek("2026-01-05", "2025-12-28")).toBe(-1);
  });
});

describe("blockModifiers", () => {
  const shape = { weeks: 5, setRampPerWeek: 1, deloadFinalWeek: true };

  it("ramps sets week over week", () => {
    expect(blockModifiers({ ...shape, week: 1 })).toEqual({
      week: 1,
      totalWeeks: 5,
      isDeload: false,
      setDelta: 0,
      setMultiplier: 1,
      loadFactor: 1,
      rpeDelta: 0,
      label: "Week 1 of 5",
    });
    expect(blockModifiers({ ...shape, week: 2 })).toMatchObject({
      setDelta: 1,
      label: "Week 2 of 5 · +1 set",
    });
    expect(blockModifiers({ ...shape, week: 4, setRampPerWeek: 2 })).toMatchObject({
      setDelta: 6,
      label: "Week 4 of 5 · +6 sets",
    });
  });

  it("deloads the final week when asked", () => {
    expect(blockModifiers({ ...shape, week: 5 })).toEqual({
      week: 5,
      totalWeeks: 5,
      isDeload: true,
      setDelta: 0,
      setMultiplier: 0.5,
      loadFactor: 0.9,
      rpeDelta: -2,
      label: "Week 5 of 5 · Deload",
    });
    expect(blockModifiers({ ...shape, week: 5, deloadFinalWeek: false })).toMatchObject({
      isDeload: false,
      setDelta: 4,
    });
  });

  it("is neutral outside the block", () => {
    expect(blockModifiers({ ...shape, week: 6 })).toMatchObject({
      isDeload: false,
      setDelta: 0,
      setMultiplier: 1,
      loadFactor: 1,
      rpeDelta: 0,
      label: "Block complete",
    });
    expect(blockModifiers({ ...shape, week: 0 })).toMatchObject({ setDelta: 0, loadFactor: 1 });
  });
});

describe("applyWeekModifiers", () => {
  const ramp = (setDelta: number): WeekModifiers =>
    blockModifiers({ week: setDelta + 1, weeks: 10, setRampPerWeek: 1, deloadFinalWeek: false });
  const deload = blockModifiers({ week: 4, weeks: 4, setRampPerWeek: 1, deloadFinalWeek: true });

  it("adds ramp sets by copying the last working set, warm-ups untouched", () => {
    const out = applyWeekModifiers([warm, work(), work(), work(62.5)], ramp(2), 2.5);
    expect(out).toEqual([warm, work(), work(), work(62.5), work(62.5), work(62.5)]);
  });

  it("halves the sets and takes 10 % off the loads on a deload", () => {
    // 3 × 0.5 = 1.5 → 2 sets; 60 × 0.9 = 54 → 55
    expect(applyWeekModifiers([warm, work(), work(), work()], deload, 2.5)).toEqual([
      warm,
      work(55),
      work(55),
    ]);
    // 2.5 × 0.9 = 2.25 → 2.5; one set stays one set
    expect(applyWeekModifiers([work(2.5)], deload, 2.5)).toEqual([work(2.5)]);
  });

  it("keeps an AMRAP or to-failure set last when sets are added", () => {
    const out = applyWeekModifiers([work(), work(), planned("amrap", 60)], ramp(1), 2.5);
    expect(out.map((s) => s.kind)).toEqual(["working", "working", "working", "amrap"]);
  });

  it("leaves bodyweight and unloaded sets' loads alone", () => {
    expect(applyWeekModifiers([work(null), work(0)], deload, 2.5)).toEqual([work(null)]);
  });

  it("is safe from float noise and empty lists", () => {
    const tenSets = Array.from({ length: 10 }, () => work());
    const custom: WeekModifiers = { ...ramp(0), setMultiplier: 0.3 };
    expect(applyWeekModifiers(tenSets, custom, 2.5)).toHaveLength(3);
    expect(applyWeekModifiers([warm], deload, 2.5)).toEqual([warm]);
    expect(applyWeekModifiers([], deload, 2.5)).toEqual([]);
  });
});
