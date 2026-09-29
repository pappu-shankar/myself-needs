// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  daysBetween,
  endOfMonth,
  parseIsoDate,
  startOfMonth,
  todayIso,
  toIsoDate,
} from "./dates";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayIso", () => {
  it("uses the local calendar date, not the UTC one", () => {
    vi.useFakeTimers();
    // 00:30 local time on 1 April: in UTC+05:30 this is still 31 March in UTC.
    vi.setSystemTime(new Date(2026, 3, 1, 0, 30));
    expect(todayIso()).toBe("2026-04-01");
  });
});

describe("parseIsoDate", () => {
  it("rejects malformed and impossible dates", () => {
    expect(() => parseIsoDate("2026-4-1")).toThrow(RangeError);
    expect(() => parseIsoDate("2026-02-30")).toThrow(RangeError);
    expect(toIsoDate(parseIsoDate("2024-02-29"))).toBe("2024-02-29");
  });
});

describe("date arithmetic", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("clamps month arithmetic to the end of shorter months", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2025-03-31", -1)).toBe("2025-02-28");
    expect(addMonths("2025-11-15", 3)).toBe("2026-02-15");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("counts whole days between dates", () => {
    expect(daysBetween("2024-03-15", "2025-03-15")).toBe(365);
    expect(daysBetween("2025-03-15", "2024-03-15")).toBe(-365);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("finds month boundaries", () => {
    expect(startOfMonth("2026-02-17")).toBe("2026-02-01");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-12-05")).toBe("2026-12-31");
  });
});
