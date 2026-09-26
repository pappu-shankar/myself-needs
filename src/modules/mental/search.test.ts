import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { createMedication, searchMental } from "./service";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("searchMental", () => {
  it("finds a medication whose name matches the query", () => {
    const created = createMedication({
      name: "Sertraline",
      dosage: "50mg",
      startDate: "2026-01-01",
    });

    const results = searchMental("sertra");

    expect(results).toEqual([
      {
        type: "medication",
        id: created.id,
        label: "Sertraline",
        subtitle: "50mg",
        href: "/mental",
      },
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    createMedication({ name: "Sertraline", startDate: "2026-01-01" });

    expect(searchMental("furious")).toEqual([]);
  });

  it("returns an empty array for an empty or whitespace-only query", () => {
    createMedication({ name: "Sertraline", startDate: "2026-01-01" });

    expect(searchMental("")).toEqual([]);
    expect(searchMental("   ")).toEqual([]);
  });

  it("caps results at 5", () => {
    for (let i = 0; i < 7; i++) {
      createMedication({ name: `Medication ${i}`, startDate: "2026-01-01" });
    }

    expect(searchMental("medication")).toHaveLength(5);
  });
});
