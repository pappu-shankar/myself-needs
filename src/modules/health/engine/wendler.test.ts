import { kgToLb, lbToKg } from "./units";
import { describe, expect, it } from "vitest";
import type { PlannedSet } from "./types";
import {
  type AmrapResult,
  effectiveTrainingMax,
  suggestTrainingMax,
  tmIncrementKg,
  WENDLER_WEEKS,
  wendlerCycleWeek,
  wendlerSets,
} from "./wendler";

const rows = (sets: PlannedSet[]) => sets.map((s) => [s.weightKg, s.reps, s.kind]);

describe("wendlerCycleWeek", () => {
  it("counts four-week cycles from the program start", () => {
    expect(wendlerCycleWeek("2026-01-05", "2026-01-05")).toEqual({ cycle: 1, week: 1 });
    expect(wendlerCycleWeek("2026-01-05", "2026-01-11")).toEqual({ cycle: 1, week: 1 });
    expect(wendlerCycleWeek("2026-01-05", "2026-01-12")).toEqual({ cycle: 1, week: 2 });
    expect(wendlerCycleWeek("2026-01-05", "2026-02-01")).toEqual({ cycle: 1, week: 4 });
    expect(wendlerCycleWeek("2026-01-05", "2026-02-02")).toEqual({ cycle: 2, week: 1 });
    expect(wendlerCycleWeek("2026-01-05", "2026-01-04")).toBeNull();
  });
});

describe("wendlerSets", () => {
  it("prescribes the main sets with the last one AMRAP", () => {
    expect(rows(wendlerSets("wendler_main", 100, 1, 2.5))).toEqual([
      [65, 5, "working"],
      [75, 5, "working"],
      [85, 5, "amrap"],
    ]);
    expect(rows(wendlerSets("wendler_main", 100, 2, 2.5))).toEqual([
      [70, 3, "working"],
      [80, 3, "working"],
      [90, 3, "amrap"],
    ]);
    expect(rows(wendlerSets("wendler_main", 100, 3, 2.5))).toEqual([
      [75, 5, "working"],
      [85, 3, "working"],
      [95, 1, "amrap"],
    ]);
  });

  it("has no AMRAP on the deload week", () => {
    expect(rows(wendlerSets("wendler_main", 100, 4, 2.5))).toEqual([
      [40, 5, "working"],
      [50, 5, "working"],
      [60, 5, "working"],
    ]);
    expect(WENDLER_WEEKS[4].amrap).toBe(false);
  });

  it("snaps every load to the step", () => {
    // 117.5 × 0.65 = 76.375, × 0.75 = 88.125, × 0.85 = 99.875
    expect(wendlerSets("wendler_main", 117.5, 1, 2.5).map((s) => s.weightKg)).toEqual([
      77.5, 87.5, 100,
    ]);
  });

  it("builds Boring But Big and First Set Last supplements", () => {
    expect(rows(wendlerSets("wendler_bbb", 100, 2, 2.5))).toEqual(
      Array(5).fill([50, 10, "working"]),
    );
    expect(wendlerSets("wendler_bbb", 100, 2, 2.5, { bbbPct: 0.6 })[0].weightKg).toBe(60);
    expect(rows(wendlerSets("wendler_fsl", 100, 2, 2.5))).toEqual(
      Array(5).fill([70, 5, "working"]),
    );
  });

  it("has nothing for standard entries, a missing TM or a bad week", () => {
    expect(wendlerSets("standard", 100, 1, 2.5)).toEqual([]);
    expect(wendlerSets("wendler_main", 0, 1, 2.5)).toEqual([]);
    expect(wendlerSets("wendler_main", 100, 5, 2.5)).toEqual([]);
  });
});

describe("training max helpers", () => {
  it("bumps lower body 5 kg and upper body 2.5 kg per cycle", () => {
    expect(tmIncrementKg("upper legs")).toBe(5);
    expect(tmIncrementKg("lower legs")).toBe(5);
    expect(tmIncrementKg("chest")).toBe(2.5);
    expect(tmIncrementKg("shoulders")).toBe(2.5);
  });

  it("suggests 90 % of e1RM, snapped", () => {
    expect(suggestTrainingMax(140, 2.5)).toBe(125);
    expect(suggestTrainingMax(100, 2.5)).toBe(90);
  });
});

describe("effectiveTrainingMax", () => {
  // Cycles: 1 = Jan 5 – Feb 1, 2 = Feb 2 – Mar 1, 3 = Mar 2 – Mar 29
  const base = {
    baseTmKg: 100,
    effectiveFrom: "2026-01-05",
    programStart: "2026-01-05",
    bodyPart: "upper legs",
    stepKg: 2.5,
  };
  const amrap = (date: string, week: number, reps: number, requiredReps = [5, 3, 1][week - 1]) =>
    ({ date, week, weightKg: 95, reps, requiredReps }) satisfies AmrapResult;
  const tm = (today: string, amrapResults: AmrapResult[], extra: Partial<typeof base> = {}) =>
    effectiveTrainingMax({ ...base, ...extra, today, amrapResults });

  it("changes nothing before a cycle completes", () => {
    expect(tm("2026-01-31", [amrap("2026-01-21", 3, 5)])).toEqual({ tmKg: 100, changes: [] });
    expect(tm("2025-12-01", [])).toEqual({ tmKg: 100, changes: [] });
  });

  it("bumps the TM when the week-3 AMRAP met its reps", () => {
    const result = tm("2026-02-02", [amrap("2026-01-21", 3, 4)]);
    expect(result.tmKg).toBe(105);
    expect(result.changes).toEqual([
      {
        cycle: 1,
        change: "bump",
        tmKg: 105,
        reason: "Cycle 1: 95 kg × 4 on the week-3 AMRAP (needed 1) — TM +5 kg to 105 kg.",
      },
    ]);
  });

  it("lets week 3 decide over earlier weeks, else the latest AMRAP", () => {
    expect(
      tm("2026-02-02", [amrap("2026-01-07", 1, 8), amrap("2026-01-21", 3, 0)]).changes[0].change,
    ).toBe("hold");
    expect(
      tm("2026-02-02", [amrap("2026-01-14", 2, 2), amrap("2026-01-07", 1, 6)]).changes[0].change,
    ).toBe("hold");
    expect(
      tm("2026-02-02", [amrap("2026-01-14", 2, 4), amrap("2026-01-07", 1, 2)]).changes[0].change,
    ).toBe("bump");
  });

  it("holds when no AMRAP was logged", () => {
    const result = tm("2026-02-02", []);
    expect(result.tmKg).toBe(100);
    expect(result.changes[0]).toMatchObject({
      change: "hold",
      reason: expect.stringContaining("no AMRAP"),
    });
  });

  it("resets 10 % after two misses in a row", () => {
    const result = tm("2026-03-02", [amrap("2026-01-21", 3, 0), amrap("2026-02-18", 3, 0)], {
      baseTmKg: 105,
    });
    // 105 × 0.9 = 94.5 → 95
    expect(result.changes.map((c) => [c.change, c.tmKg])).toEqual([
      ["hold", 105],
      ["reset", 95],
    ]);
    expect(result.tmKg).toBe(95);
  });

  it("does not let a cycle without data break a run of misses — but a bump does", () => {
    const misses = tm("2026-03-30", [amrap("2026-01-21", 3, 0), amrap("2026-03-18", 3, 0)]);
    expect(misses.changes.map((c) => c.change)).toEqual(["hold", "hold", "reset"]);
    const recovered = tm("2026-03-30", [
      amrap("2026-01-21", 3, 0),
      amrap("2026-02-18", 3, 2),
      amrap("2026-03-18", 3, 0),
    ]);
    expect(recovered.changes.map((c) => c.change)).toEqual(["hold", "bump", "hold"]);
    expect(recovered.tmKg).toBe(105);
  });

  it("only counts cycles and results from when the TM was set", () => {
    const result = tm(
      "2026-03-02",
      [amrap("2026-01-21", 3, 5), amrap("2026-02-04", 1, 0, 5), amrap("2026-02-18", 2, 5, 3)],
      { effectiveFrom: "2026-02-10" },
    );
    // cycle 1 ended before the TM was set; cycle 2's Feb 4 miss predates it
    expect(result.changes).toEqual([
      expect.objectContaining({ cycle: 2, change: "bump", tmKg: 105 }),
    ]);
  });

  it("uses the upper-body increment for upper-body lifts", () => {
    expect(tm("2026-02-02", [amrap("2026-01-21", 3, 1)], { bodyPart: "chest" }).tmKg).toBe(102.5);
  });
});

describe("pound users", () => {
  it("bumps the TM by 10 lb for lower-body lifts and reports in pounds", () => {
    const tm = lbToKg(300);
    const { tmKg, changes } = effectiveTrainingMax({
      baseTmKg: tm,
      effectiveFrom: "2026-01-05",
      programStart: "2026-01-05",
      today: "2026-02-05",
      bodyPart: "upper legs",
      stepKg: lbToKg(5),
      weightUnit: "lb",
      amrapResults: [
        { date: "2026-01-21", week: 3, weightKg: lbToKg(285), reps: 3, requiredReps: 1 },
      ],
    });
    expect(kgToLb(tmKg)).toBeCloseTo(310, 1);
    expect(changes[0].reason).toContain("TM +10 lb to 310 lb");
  });
});
