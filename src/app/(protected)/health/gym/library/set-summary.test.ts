import { describe, expect, it } from "vitest";
import { formatSet, formatSetsSummary } from "./set-summary";

const set = (over: Partial<Parameters<typeof formatSet>[0]>) => ({
  kind: "normal",
  weightKg: null,
  reps: null,
  durationSec: null,
  distanceKm: null,
  completed: true,
  ...over,
});

describe("formatSet", () => {
  it("formats loaded sets", () => {
    expect(formatSet(set({ weightKg: 82.5, reps: 4 }))).toBe("82.5 × 4");
  });
  it("formats bodyweight sets", () => {
    expect(formatSet(set({ reps: 12 }), true)).toBe("BW × 12");
    expect(formatSet(set({ weightKg: 10, reps: 8 }), true)).toBe("+10 × 8");
  });
  it("formats loads in pounds", () => {
    expect(formatSet(set({ weightKg: 102.058, reps: 5 }), false, "lb")).toBe("225 × 5");
    expect(formatSet(set({ weightKg: 4.536, reps: 8 }), true, "lb")).toBe("+10 × 8");
  });
  it("formats holds and cardio", () => {
    expect(formatSet(set({ durationSec: 45 }))).toBe("0:45");
    expect(formatSet(set({ distanceKm: 5, durationSec: 1500 }))).toBe("5 km · 25:00");
  });
  it("skips unfinished sets", () => {
    expect(formatSet(set({ weightKg: 80, reps: 5, completed: false }))).toBeNull();
  });
});

describe("formatSetsSummary", () => {
  it("joins working sets and drops warm-ups", () => {
    expect(
      formatSetsSummary([
        set({ kind: "warmup", weightKg: 40, reps: 10 }),
        set({ weightKg: 80, reps: 5 }),
        set({ weightKg: 80, reps: 5 }),
        set({ weightKg: 82.5, reps: 4 }),
      ]),
    ).toBe("80 × 5, 80 × 5, 82.5 × 4");
  });
  it("shows a dash when nothing was completed", () => {
    expect(formatSetsSummary([])).toBe("—");
  });
});
