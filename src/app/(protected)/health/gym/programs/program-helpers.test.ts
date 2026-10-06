import { describe, expect, it } from "vitest";
import { blockWeekNotes, weekProgress, wendlerWeekLines } from "./program-helpers";

describe("weekProgress", () => {
  it("clamps the week into the program", () => {
    expect(weekProgress(3, 6)).toEqual({ current: 3, total: 6, percent: 50 });
    expect(weekProgress(9, 6).current).toBe(6);
    expect(weekProgress(0, 6).current).toBe(1);
  });
});

describe("blockWeekNotes", () => {
  const base = { isDeload: false, setDelta: 0, setMultiplier: 1, loadFactor: 1, rpeDelta: 0 };
  it("describes a ramp week and a deload", () => {
    expect(blockWeekNotes({ ...base, setDelta: 2 })[0]).toBe("+2 working sets per exercise");
    const deload = blockWeekNotes({
      ...base,
      isDeload: true,
      setMultiplier: 0.5,
      loadFactor: 0.9,
      rpeDelta: -2,
    });
    expect(deload[0]).toContain("50 %");
    expect(deload[1]).toContain("90 %");
  });
});

describe("wendlerWeekLines", () => {
  it("lists percentages, marking the AMRAP set", () => {
    expect(wendlerWeekLines(1)).toEqual(["65 % × 5", "75 % × 5", "85 % × 5+"]);
    expect(wendlerWeekLines(3)).toEqual(["75 % × 5", "85 % × 3", "95 % × 1+"]);
    expect(wendlerWeekLines(4)).toEqual(["40 % × 5", "50 % × 5", "60 % × 5"]);
  });
});
