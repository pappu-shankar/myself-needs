import { describe, expect, it } from "vitest";
import { MONDAY_FIRST, dayKind, formatPlanDate, sourceLabel } from "./plan-format";

describe("plan format", () => {
  it("starts the week on Monday and covers every weekday once", () => {
    expect(MONDAY_FIRST[0]).toBe(1);
    expect(MONDAY_FIRST[6]).toBe(0);
    expect(new Set(MONDAY_FIRST).size).toBe(7);
  });

  it("formats a date with its weekday", () => {
    expect(formatPlanDate("2026-10-05")).toBe("Mon 5 Oct");
  });

  it("tells routines, rest days and unplanned days apart", () => {
    expect(dayKind({ routineId: 3, source: "week" })).toBe("routine");
    expect(dayKind({ routineId: null, source: "override" })).toBe("rest");
    expect(dayKind({ routineId: null, source: "none" })).toBe("none");
  });

  it("labels where a day comes from", () => {
    expect(sourceLabel("override")).toBe("One-off change");
    expect(sourceLabel("week")).toBe("Weekly plan");
  });
});
