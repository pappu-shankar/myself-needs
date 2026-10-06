import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { dismissGymInsight, listDismissedGymInsightIds } from "./insights-store";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("dismissed gym insights", () => {
  it("remembers dismissed ids, idempotently", () => {
    expect(listDismissedGymInsightIds().size).toBe(0);

    dismissGymInsight("stalled:12:100");
    dismissGymInsight("stalled:12:100");
    dismissGymInsight("neglected:calves:2026-W40");

    expect(listDismissedGymInsightIds()).toEqual(
      new Set(["stalled:12:100", "neglected:calves:2026-W40"]),
    );
    expect(() => dismissGymInsight("   ")).toThrow("Unknown insight");
  });
});
