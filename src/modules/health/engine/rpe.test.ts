import { describe, expect, it } from "vitest";
import {
  autoregulatedPrescription,
  e1rmFromRpe,
  effectiveRpe,
  loadForRpe,
  percentOf1rm,
  rpeForSet,
  RPE_STEPS,
  RTS_PERCENT_CHART,
} from "./rpe";
import type { ExercisePlan, ExerciseSession, SetRecord } from "./types";

const plan = (fields: Partial<ExercisePlan> = {}): ExercisePlan => ({
  exerciseId: 1,
  bodyPart: "chest",
  mode: "reps",
  sets: 3,
  reps: 5,
  repsMin: null,
  weightKg: 60,
  durationSec: null,
  distanceKm: null,
  perSide: false,
  isBodyweight: false,
  policy: "linear",
  incrementKg: null,
  targetRpe: 8,
  scheme: "standard",
  ...fields,
});

const set = (weightKg: number, reps: number, extra: Partial<SetRecord> = {}): SetRecord => ({
  kind: "working",
  weightKg,
  reps,
  durationSec: null,
  distanceKm: null,
  rir: null,
  rpe: null,
  completed: true,
  ...extra,
});

const session = (date: string, sets: SetRecord[], workoutId = 1): ExerciseSession => ({
  workoutId,
  date,
  target: null,
  sets,
});

describe("RTS chart", () => {
  it("covers reps 1–12 at RPE 10 down to 6.5", () => {
    expect(RTS_PERCENT_CHART).toHaveLength(12);
    expect(RPE_STEPS).toEqual([10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5]);
    for (const row of RTS_PERCENT_CHART) expect(row).toHaveLength(RPE_STEPS.length);
  });

  it("is internally consistent: half an RPE point is half a rep", () => {
    for (let r = 0; r < RTS_PERCENT_CHART.length - 1; r++) {
      for (let c = 0; c + 2 < RPE_STEPS.length; c++) {
        expect(RTS_PERCENT_CHART[r][c + 2]).toBe(RTS_PERCENT_CHART[r + 1][c]);
      }
    }
  });

  it("gets lighter with every extra rep and every easier RPE", () => {
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < RPE_STEPS.length; c++) {
        if (c > 0) expect(RTS_PERCENT_CHART[r][c]).toBeLessThan(RTS_PERCENT_CHART[r][c - 1]);
        if (r > 0) expect(RTS_PERCENT_CHART[r][c]).toBeLessThan(RTS_PERCENT_CHART[r - 1][c]);
      }
    }
  });
});

describe("percentOf1rm", () => {
  it("reads the chart as a fraction", () => {
    expect(percentOf1rm(1, 10)).toBe(1);
    expect(percentOf1rm(5, 8)).toBe(0.811);
    expect(percentOf1rm(12, 6.5)).toBe(0.586);
    expect(percentOf1rm(5, 8.3)).toBe(0.824); // snapped to RPE 8.5
  });

  it("is null off the chart", () => {
    expect(percentOf1rm(13, 8)).toBeNull();
    expect(percentOf1rm(0, 8)).toBeNull();
    expect(percentOf1rm(2.5, 8)).toBeNull();
    expect(percentOf1rm(5, 6)).toBeNull();
    expect(percentOf1rm(5, 10.5)).toBeNull();
    expect(percentOf1rm(5, Number.NaN)).toBeNull();
  });
});

describe("loads and RPE from a set", () => {
  it("snaps the load for a target RPE", () => {
    expect(loadForRpe(120, 5, 8, 2.5)).toBe(97.5);
    expect(loadForRpe(0, 5, 8, 2.5)).toBeNull();
    expect(loadForRpe(120, 15, 8, 2.5)).toBeNull();
  });

  it("finds the nearest chart RPE for a set", () => {
    expect(rpeForSet(120, 97.5, 5)).toBe(8);
    expect(rpeForSet(100, 100, 1)).toBe(10);
    expect(rpeForSet(100, 110, 3)).toBe(10); // heavier than predicted — the e1RM was low
    expect(rpeForSet(100, 77, 5)).toBe(6.5);
    expect(rpeForSet(100, 76.9, 5)).toBe(6.5);
    expect(rpeForSet(100, 76.7, 5)).toBeNull(); // too light to rate
    expect(rpeForSet(100, 50, 13)).toBeNull();
    expect(rpeForSet(0, 50, 5)).toBeNull();
  });

  it("derives e1RM from a rated set", () => {
    expect(e1rmFromRpe(97.5, 5, 8)).toBe(120.2);
    expect(e1rmFromRpe(100, 1, 10)).toBe(100);
    expect(e1rmFromRpe(100, 5, 5)).toBeNull();
  });

  it("reads RPE, else 10 − RIR", () => {
    expect(effectiveRpe({ rpe: 8, rir: null })).toBe(8);
    expect(effectiveRpe({ rpe: null, rir: 2 })).toBe(8);
    expect(effectiveRpe({ rpe: 9, rir: 3 })).toBe(9);
    expect(effectiveRpe({ rpe: null, rir: null })).toBeNull();
  });
});

describe("autoregulatedPrescription", () => {
  const opts = { today: "2026-03-01", formula: "epley" as const };

  it("loads from the best recent e1RM and explains the arithmetic", () => {
    // 100 × 6 → Epley e1RM 120
    const rx = autoregulatedPrescription(plan(), [session("2026-02-20", [set(100, 6)])], opts);
    expect(rx).toMatchObject({ policy: "linear", kind: "autoreg", weightKg: 97.5, reps: 5 });
    expect(rx.reason).toBe("Best recent e1RM 120 kg → 5 reps @ RPE 8 (81 %) = 97.5 kg.");
  });

  it("prefers the chart for sets logged with RPE or RIR", () => {
    // 100 × 5 @ RPE 10 → 100 / 0.863 = 115.9 (Epley alone would say 116.7)
    const rated = autoregulatedPrescription(
      plan(),
      [session("2026-02-20", [set(100, 5, { rpe: 10 })])],
      opts,
    );
    expect(rated.reason).toContain("e1RM 115.9 kg");
    const rir = autoregulatedPrescription(
      plan(),
      [session("2026-02-20", [set(100, 5, { rir: 0 })])],
      opts,
    );
    expect(rir.reason).toContain("e1RM 115.9 kg");
  });

  it("takes the best set across the window, ignoring warm-ups and unchecked sets", () => {
    const history = [
      session("2026-02-10", [set(90, 5)], 1),
      session(
        "2026-02-20",
        [set(140, 3, { kind: "warmup" }), set(150, 5, { completed: false }), set(100, 6)],
        2,
      ),
    ];
    expect(autoregulatedPrescription(plan(), history, opts).weightKg).toBe(97.5);
  });

  it("only trusts the lookback window", () => {
    const old = [session("2026-01-01", [set(100, 6)])];
    const rx = autoregulatedPrescription(plan(), old, opts);
    expect(rx.kind).toBe("first");
    expect(rx.reason).toContain("RPE 8 for 5");
    expect(autoregulatedPrescription(plan(), old, { ...opts, lookbackDays: 90 }).kind).toBe(
      "autoreg",
    );
    expect(
      autoregulatedPrescription(plan(), [session("2026-03-05", [set(100, 6)])], opts).kind,
    ).toBe("first");
  });

  it("snaps to the entry's increment", () => {
    const rx = autoregulatedPrescription(
      plan({ incrementKg: 1 }),
      [session("2026-02-20", [set(100, 6)])],
      opts,
    );
    expect(rx.weightKg).toBe(97);
  });

  it("falls back to the progression policy without a usable target RPE", () => {
    const history = [session("2026-02-20", [set(60, 5), set(60, 5), set(60, 5)])];
    expect(autoregulatedPrescription(plan({ targetRpe: null }), history, opts)).toMatchObject({
      kind: "up",
      weightKg: 62.5,
    });
    expect(autoregulatedPrescription(plan({ reps: 15 }), [], opts).kind).toBe("first");
    expect(autoregulatedPrescription(plan({ reps: 15, policy: "off" }), [], opts).kind).toBe("off");
  });
});
