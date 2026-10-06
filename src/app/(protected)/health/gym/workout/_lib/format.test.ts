import { describe, expect, it } from "vitest";
import type { EntryTarget, PlannedSet } from "@/modules/health/engine/types";
import {
  describePlannedSets,
  elapsedSec,
  formatMinutes,
  guessMovement,
  parseLocalDateTime,
  recordLabel,
  setLabels,
  speedAndPace,
  targetSummary,
} from "./format";

function target(patch: Partial<EntryTarget>): EntryTarget {
  return {
    mode: "reps",
    sets: 3,
    reps: 5,
    repsMin: null,
    weightKg: 100,
    durationSec: null,
    distanceKm: null,
    targetRpe: null,
    ...patch,
  };
}

function planned(patch: Partial<PlannedSet>): PlannedSet {
  return { kind: "working", weightKg: 100, reps: 5, durationSec: null, distanceKm: null, ...patch };
}

describe("targetSummary", () => {
  const plain = { perSide: false, isBodyweight: false };
  it("describes each mode", () => {
    expect(targetSummary(target({}), plain)).toBe("3 × 5 @ 100 kg");
    expect(targetSummary(target({ repsMin: 8, reps: 12, weightKg: 20 }), plain)).toBe(
      "3 × 8–12 @ 20 kg",
    );
    expect(
      targetSummary(target({ reps: 8, weightKg: 10 }), { perSide: true, isBodyweight: true }),
    ).toBe("3 × 8 per side · +10 kg");
    expect(targetSummary(target({ weightKg: null }), { perSide: false, isBodyweight: true })).toBe(
      "3 × 5",
    );
    expect(targetSummary(target({ mode: "time", durationSec: 45, weightKg: null }), plain)).toBe(
      "3 × 0:45",
    );
    expect(targetSummary(target({ mode: "cardio", durationSec: 1800, distanceKm: 5 }), plain)).toBe(
      "30:00 · 5 km · 10 km/h · 6:00 /km",
    );
    expect(
      targetSummary(target({ mode: "cardio", durationSec: 1800, distanceKm: null }), plain),
    ).toBe("30:00");
    expect(targetSummary(target({ targetRpe: 8 }), plain)).toBe("3 × 5 @ 100 kg · RPE 8");
  });

  it("shows loads in pounds for lb users", () => {
    const lb = { perSide: false, isBodyweight: false, weightUnit: "lb" as const };
    expect(targetSummary(target({ weightKg: 102.058 }), lb)).toBe("3 × 5 @ 225 lb");
    expect(targetSummary(target({ reps: 8, weightKg: 4.536 }), { ...lb, isBodyweight: true })).toBe(
      "3 × 8 · +10 lb",
    );
  });
});

describe("speedAndPace", () => {
  it("gives average speed and pace only with both distance and time", () => {
    expect(speedAndPace(5, 1500)).toBe("12 km/h · 5:00 /km");
    expect(speedAndPace(10, 3330)).toBe("10.8 km/h · 5:33 /km");
    expect(speedAndPace(null, 1500)).toBeNull();
    expect(speedAndPace(5, null)).toBeNull();
    expect(speedAndPace(0, 1500)).toBeNull();
  });
});

describe("describePlannedSets", () => {
  it("collapses identical work sets and lists differing ones", () => {
    expect(describePlannedSets([planned({}), planned({}), planned({})], "reps", false)).toBe(
      "3 × 5 @ 100 kg",
    );
    expect(
      describePlannedSets(
        [
          planned({ kind: "warmup", weightKg: 40 }),
          planned({ weightKg: 65 }),
          planned({ weightKg: 75 }),
          planned({ kind: "amrap", weightKg: 85 }),
        ],
        "reps",
        false,
      ),
    ).toBe("5 @ 65 kg, 5 @ 75 kg, 5+ @ 85 kg (+1 warm-up)");
  });

  it("uses the display unit", () => {
    expect(describePlannedSets([planned({ weightKg: 61.235 })], "reps", false, "lb")).toBe(
      "1 × 5 @ 135 lb",
    );
  });
});

describe("times", () => {
  it("parses local date-times and measures elapsed time", () => {
    const start = parseLocalDateTime("2026-10-04T18:30:00");
    expect(start).toBe(new Date(2026, 9, 4, 18, 30, 0).getTime());
    expect(elapsedSec("2026-10-04T18:30:00", start! + 61_500)).toBe(61);
    expect(elapsedSec("garbage", start!)).toBe(0);
    expect(parseLocalDateTime("2026-10-04")).toBeNull();
  });

  it("formats minutes", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(65)).toBe("1 h 05 min");
    expect(formatMinutes(null)).toBe("—");
  });
});

describe("labels", () => {
  it("numbers work sets and marks warm-ups", () => {
    expect(
      setLabels([{ kind: "warmup" }, { kind: "warmup" }, { kind: "working" }, { kind: "amrap" }]),
    ).toEqual([
      { label: "W", name: "Warm-up 1" },
      { label: "W", name: "Warm-up 2" },
      { label: "1", name: "Set 1" },
      { label: "2", name: "Set 2" },
    ]);
  });

  it("names records", () => {
    expect(recordLabel({ type: "e1rm", value: 105, context: "100 kg × 2" })).toBe("e1RM 105 kg");
    expect(recordLabel({ type: "most_reps_at_weight", value: 6, context: "100 kg × 6" })).toBe(
      "Most reps: 100 kg × 6",
    );
    expect(recordLabel({ type: "longest_hold", value: 90, context: "" })).toBe("Longest hold 1:30");
    expect(recordLabel({ type: "heaviest", value: 102.058, context: "" }, "lb")).toBe(
      "Heaviest 225 lb",
    );
  });
});

describe("guessMovement", () => {
  it("maps obvious exercise names to a camera movement", () => {
    expect(guessMovement("barbell full squat")).toBe("squat");
    expect(guessMovement("dumbbell bulgarian split squat")).toBe("lunge");
    expect(guessMovement("push-up")).toBe("pushup");
    expect(guessMovement("barbell romanian deadlift")).toBe("hinge");
    expect(guessMovement("chin-up")).toBe("pullup");
    expect(guessMovement("dumbbell lateral raise")).toBe("lateral_raise");
    expect(guessMovement("barbell curl")).toBe("curl");
    expect(guessMovement("dumbbell seated shoulder press")).toBe("overhead_press");
    expect(guessMovement("lever lying leg curl")).toBeUndefined();
    expect(guessMovement("cable crossover")).toBeUndefined();
  });
});
