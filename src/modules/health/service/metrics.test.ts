import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createMetric, getLatestMetricSummary, getMetricTrend, getMetrics } from "./metrics";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("health metrics service", () => {
  it("creates a metric and lists it", () => {
    createMetric({ type: "weight", date: "2026-08-01", label: "Weight", value: 70, unit: "kg" });

    const metrics = getMetrics();

    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ type: "weight", label: "Weight", value: 70 });
  });

  it("lists metrics newest first", () => {
    createMetric({ type: "weight", date: "2026-08-01", label: "Weight", value: 70, unit: "kg" });
    createMetric({ type: "weight", date: "2026-08-05", label: "Weight", value: 69, unit: "kg" });

    const metrics = getMetrics();

    expect(metrics.map((m) => m.date)).toEqual(["2026-08-05", "2026-08-01"]);
  });

  it("returns the trend for a metric type, filtered by since date and oldest first", () => {
    createMetric({ type: "weight", date: "2026-08-01", label: "Weight", value: 70, unit: "kg" });
    createMetric({ type: "weight", date: "2026-08-10", label: "Weight", value: 68, unit: "kg" });
    createMetric({
      type: "sleep_hours",
      date: "2026-08-05",
      label: "Sleep",
      value: 7,
      unit: "hours",
    });

    const trend = getMetricTrend("weight");
    expect(trend.map((m) => m.date)).toEqual(["2026-08-01", "2026-08-10"]);

    const sinceTrend = getMetricTrend("weight", "2026-08-05");
    expect(sinceTrend.map((m) => m.date)).toEqual(["2026-08-10"]);
  });

  it("summarizes the latest metric, or null when there are none", () => {
    expect(getLatestMetricSummary()).toBeNull();

    createMetric({ type: "weight", date: "2026-08-01", label: "Weight", value: 70, unit: "kg" });
    createMetric({
      type: "sleep_hours",
      date: "2026-08-05",
      label: "Sleep",
      value: 7,
      unit: "hours",
    });

    expect(getLatestMetricSummary()).toEqual({ label: "Sleep", value: 7, date: "2026-08-05" });
  });
});
