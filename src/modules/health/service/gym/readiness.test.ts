import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getReadinessCheckin, listReadinessCheckins, upsertReadinessCheckin } from "./readiness";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

const ratings = { sleepQuality: 4, energy: 3, soreness: 2, stress: 2, motivation: 5 };

describe("readiness check-ins", () => {
  it("keeps one check-in per date, replacing an earlier save", () => {
    expect(getReadinessCheckin("2026-09-01")).toBeNull();

    upsertReadinessCheckin("2026-09-01", { ...ratings, note: "  slept late " });
    const replaced = upsertReadinessCheckin("2026-09-01", { ...ratings, energy: 5 });

    expect(replaced).toMatchObject({ date: "2026-09-01", energy: 5, note: null });
    expect(getReadinessCheckin("2026-09-01")).toMatchObject({ energy: 5, motivation: 5 });
    expect(listReadinessCheckins("2026-09-01", "2026-09-01")).toHaveLength(1);
  });

  it("requires whole ratings from 1 to 5", () => {
    expect(() => upsertReadinessCheckin("2026-09-01", { ...ratings, soreness: 0 })).toThrow(
      "Soreness must be a whole number from 1 to 5.",
    );
    expect(() => upsertReadinessCheckin("2026-09-01", { ...ratings, stress: 6 })).toThrow("Stress");
    expect(() => upsertReadinessCheckin("2026-09-01", { ...ratings, energy: 2.5 })).toThrow(
      "Energy",
    );
    expect(() => upsertReadinessCheckin("2026-09-31", ratings)).toThrow("calendar date");
  });

  it("lists a date range oldest first", () => {
    upsertReadinessCheckin("2026-09-03", ratings);
    upsertReadinessCheckin("2026-09-01", ratings);
    upsertReadinessCheckin("2026-09-10", ratings);

    expect(listReadinessCheckins("2026-09-01", "2026-09-05").map((c) => c.date)).toEqual([
      "2026-09-01",
      "2026-09-03",
    ]);
  });
});
