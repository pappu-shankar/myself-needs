import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createMetric } from "./metrics";
import { createMedication } from "./medications";
import { searchHealth } from "./search";
import { createRoutine } from "./gym/routines";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("health search service", () => {
  it("finds a metric by label", () => {
    createMetric({
      type: "weight",
      label: "Morning weight",
      value: 70,
      unit: "kg",
      date: "2026-08-01",
    });

    // "Good Morning" catalog exercises match too — only the metric matters here.
    const results = searchHealth("morning").filter((r) => r.type === "metric");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "metric", label: "Morning weight", href: "/health" });
  });

  it("finds a medication by name", () => {
    createMedication({ name: "Aspirin", startDate: "2026-01-01" });

    const results = searchHealth("aspir");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "medication", label: "Aspirin", href: "/health" });
  });

  it("finds catalog exercises and routines, linking into the gym", () => {
    createRoutine({ name: "Bench day" });

    const results = searchHealth("bench press");

    expect(results.find((r) => r.type === "exercise")).toMatchObject({
      href: expect.stringMatching(/^\/health\/gym\/library\/\d+$/),
    });
    expect(searchHealth("bench day")).toEqual([
      expect.objectContaining({ type: "routine", label: "Bench day" }),
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    createMetric({
      type: "weight",
      label: "Morning weight",
      value: 70,
      unit: "kg",
      date: "2026-08-01",
    });

    expect(searchHealth("zzz-no-match")).toEqual([]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    createMetric({
      type: "weight",
      label: "Morning weight",
      value: 70,
      unit: "kg",
      date: "2026-08-01",
    });

    expect(searchHealth("")).toEqual([]);
    expect(searchHealth("   ")).toEqual([]);
  });

  it("caps results at 5 per table", () => {
    for (let i = 0; i < 7; i++) {
      createMedication({ name: `Vitamin ${i}`, startDate: "2026-01-01" });
    }

    const results = searchHealth("vitamin");

    expect(results).toHaveLength(5);
  });
});
