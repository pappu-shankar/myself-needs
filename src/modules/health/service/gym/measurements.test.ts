import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  addMeasurements,
  deleteMeasurement,
  getMeasurementSeries,
  latestMeasurements,
  listMeasurements,
} from "./measurements";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("body measurements", () => {
  it("validates sites, ranges and duplicates, saving nothing on failure", () => {
    expect(() => addMeasurements({ date: "2026-09-01", entries: [] })).toThrow("at least one");
    expect(() =>
      addMeasurements({ date: "2026-09-01", entries: [{ site: "waist", value: 0.5 }] }),
    ).toThrow("Waist must be between 1 and 300 cm");
    expect(() =>
      addMeasurements({ date: "2026-09-01", entries: [{ site: "waist", value: 301 }] }),
    ).toThrow("between 1 and 300");
    expect(() =>
      addMeasurements({
        date: "2026-09-01",
        entries: [
          { site: "waist", value: 82 },
          { site: "body_fat_pct", value: 75 },
        ],
      }),
    ).toThrow("between 2 and 70 %");
    expect(() =>
      addMeasurements({
        date: "2026-09-01",
        entries: [
          { site: "waist", value: 82 },
          { site: "waist", value: 83 },
        ],
      }),
    ).toThrow("more than once");
    expect(() =>
      addMeasurements({ date: "2026-02-30", entries: [{ site: "waist", value: 82 }] }),
    ).toThrow("calendar date");
    expect(listMeasurements().total).toBe(0);
  });

  it("stores, pages, trends and summarizes readings", () => {
    const first = addMeasurements({
      date: "2026-08-01",
      entries: [
        { site: "waist", value: 84 },
        { site: "neck", value: 38 },
      ],
      note: "  morning ",
    });
    expect(first).toHaveLength(2);
    expect(first[0]).toMatchObject({ site: "waist", value: 84, note: "morning" });
    addMeasurements({
      date: "2026-09-01",
      entries: [
        { site: "waist", value: 82 },
        { site: "body_fat_pct", value: 18 },
      ],
    });

    const all = listMeasurements();
    expect(all.total).toBe(4);
    expect(all.rows.map((r) => r.date)).toEqual([
      "2026-09-01",
      "2026-09-01",
      "2026-08-01",
      "2026-08-01",
    ]);
    expect(listMeasurements({ site: "waist", limit: 1 })).toMatchObject({
      rows: [{ value: 82 }],
      total: 2,
    });
    expect(listMeasurements({ from: "2026-08-15" }).total).toBe(2);

    expect(getMeasurementSeries("waist").map((r) => [r.date, r.value])).toEqual([
      ["2026-08-01", 84],
      ["2026-09-01", 82],
    ]);
    expect(latestMeasurements()).toEqual({
      waist: { value: 82, date: "2026-09-01" },
      neck: { value: 38, date: "2026-08-01" },
      body_fat_pct: { value: 18, date: "2026-09-01" },
    });

    deleteMeasurement(first[1].id);
    expect(latestMeasurements().neck).toBeUndefined();
    expect(() => deleteMeasurement(first[1].id)).toThrow("no longer exists");
  });
});
