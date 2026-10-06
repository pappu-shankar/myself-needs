import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createMetric } from "../metrics";
import {
  getBodyweightOn,
  getBodyweightSeries,
  getLatestBodyweight,
  getSleepHoursOn,
  logBodyweight,
} from "./vitals";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("gym vitals", () => {
  it("finds the weight that applied on a date (latest on or before it)", () => {
    expect(getBodyweightOn("2026-09-10")).toBeNull();
    expect(getLatestBodyweight()).toBeNull();

    logBodyweight("2026-09-01", 80);
    logBodyweight("2026-09-05", 79.5, "  after cardio ");
    logBodyweight("2026-09-05", 79.2);
    logBodyweight("2026-09-12", 78.8);

    expect(getBodyweightOn("2026-08-31")).toBeNull();
    expect(getBodyweightOn("2026-09-01")).toEqual({ date: "2026-09-01", weightKg: 80 });
    expect(getBodyweightOn("2026-09-10")).toEqual({ date: "2026-09-05", weightKg: 79.2 });
    expect(getLatestBodyweight()).toEqual({ date: "2026-09-12", weightKg: 78.8 });
    expect(() => getBodyweightOn("2026-13-01")).toThrow("calendar date");
  });

  it("logs a weigh-in as a regular weight metric, within 20–400 kg", () => {
    const row = logBodyweight("2026-09-01", 81.4, "  morning ");
    expect(row).toMatchObject({
      type: "weight",
      label: "Weight",
      unit: "kg",
      value: 81.4,
      note: "morning",
    });
    expect(() => logBodyweight("2026-09-01", 19)).toThrow("between 20 and 400");
    expect(() => logBodyweight("2026-09-01", 401)).toThrow("between 20 and 400");
    expect(() => logBodyweight("2026-02-30", 80)).toThrow("calendar date");
  });

  it("returns the weight series oldest first, ignoring other metrics", () => {
    logBodyweight("2026-09-05", 79);
    logBodyweight("2026-09-01", 80);
    createMetric({
      type: "sleep_hours",
      date: "2026-09-03",
      label: "Sleep",
      value: 7,
      unit: "hours",
    });

    expect(getBodyweightSeries()).toEqual([
      { date: "2026-09-01", weightKg: 80 },
      { date: "2026-09-05", weightKg: 79 },
    ]);
    expect(getBodyweightSeries("2026-09-02")).toEqual([{ date: "2026-09-05", weightKg: 79 }]);
  });

  it("reads that date's sleep hours only", () => {
    createMetric({
      type: "sleep_hours",
      date: "2026-09-03",
      label: "Sleep",
      value: 6,
      unit: "hours",
    });
    createMetric({
      type: "sleep_hours",
      date: "2026-09-03",
      label: "Sleep",
      value: 7.5,
      unit: "hours",
    });

    expect(getSleepHoursOn("2026-09-03")).toBe(7.5);
    expect(getSleepHoursOn("2026-09-04")).toBeNull();
  });
});
