import { describe, expect, it } from "vitest";
import {
  groupSupersets,
  movedOrder,
  repsLabel,
  summarizeEntry,
  type SummaryEntry,
} from "./entry-summary";

const base: SummaryEntry = {
  mode: "reps",
  sets: 3,
  reps: 10,
  repsMin: 8,
  weightKg: 60,
  durationSec: null,
  distanceKm: null,
  restSec: 120,
  perSide: false,
  isBodyweight: false,
  effectivePolicy: "double",
  scheme: "standard",
};

describe("summarizeEntry", () => {
  it("shows loads in pounds", () => {
    expect(summarizeEntry({ ...base, weightKg: 102.058 }, "lb")).toContain("225 lb");
  });

  it("describes a double progression entry", () => {
    expect(summarizeEntry(base)).toBe("3 × 8–10 · 60 kg · rest 2:00 · Double progression");
  });

  it("handles bodyweight, per side and no rest", () => {
    expect(
      summarizeEntry({
        ...base,
        isBodyweight: true,
        weightKg: null,
        repsMin: null,
        reps: 12,
        perSide: true,
        restSec: null,
        effectivePolicy: "off",
      }),
    ).toBe("3 × 12 per side · bodyweight · No automatic progression");
  });

  it("describes timed and cardio entries", () => {
    expect(
      summarizeEntry({
        ...base,
        mode: "time",
        durationSec: 45,
        weightKg: null,
        effectivePolicy: "time",
      }),
    ).toBe("3 × 0:45 · rest 2:00 · Add time");
    expect(
      summarizeEntry({
        ...base,
        mode: "cardio",
        durationSec: 1200,
        distanceKm: 3.5,
        restSec: null,
        effectivePolicy: "off",
      }),
    ).toBe("20:00 · 3.5 km");
  });

  it("names a 5/3/1 scheme instead of the policy", () => {
    expect(summarizeEntry({ ...base, scheme: "wendler_main", repsMin: null, reps: 5 })).toContain(
      "5/3/1 main sets",
    );
  });
});

describe("repsLabel", () => {
  it("collapses equal bounds and missing values", () => {
    expect(repsLabel(8, 8)).toBe("8");
    expect(repsLabel(null, null)).toBe("?");
    expect(repsLabel(10, 6)).toBe("6–10");
  });
});

describe("groupSupersets", () => {
  it("groups only adjacent entries with the same group", () => {
    const items = [
      { id: 1, supersetGroup: 1 },
      { id: 2, supersetGroup: 1 },
      { id: 3, supersetGroup: null },
      { id: 4, supersetGroup: null },
      { id: 5, supersetGroup: 1 },
    ];
    expect(groupSupersets(items).map((g) => g.map((i) => i.id))).toEqual([[1, 2], [3], [4], [5]]);
  });
});

describe("movedOrder", () => {
  it("swaps neighbours and refuses to move past the ends", () => {
    expect(movedOrder([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(movedOrder([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(movedOrder([1, 2, 3], 0, -1)).toBeNull();
    expect(movedOrder([1, 2, 3], 2, 1)).toBeNull();
  });
});
