// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AppleHealthParser, parseAppleHealthBlob } from "./apple-health";

const rec = (value: string, date: string, unit = "kg", type = "HKQuantityTypeIdentifierBodyMass") =>
  `<Record type="${type}" sourceName="Withings" unit="${unit}" creationDate="${date} +0530" startDate="${date} +0530" endDate="${date} +0530" value="${value}"/>`;

const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<HealthData locale="en_IN">',
  rec("72", "2024-03-01 07:00:00", "count", "HKQuantityTypeIdentifierStepCount"),
  rec("80.5", "2024-03-01 07:30:00"),
  rec("80.1", "2024-03-01 21:00:00"),
  rec("176.4", "2024-03-02 07:30:00", "lb"),
  rec("79000", "2024-03-03 07:30:00", "g"),
  rec("5", "2024-03-04 07:30:00", "stone"),
  "</HealthData>",
].join("\n");

describe("AppleHealthParser", () => {
  it("extracts body mass, one per day, in kg", () => {
    const parser = new AppleHealthParser();
    parser.push(XML);
    const result = parser.finish();
    expect(result.source).toBe("apple_health");
    expect(result.weighIns).toEqual([
      { date: "2024-03-01", weightKg: 80.1 },
      { date: "2024-03-02", weightKg: 80.01 },
      { date: "2024-03-03", weightKg: 79 },
    ]);
    expect(result.warnings.join(" ")).toMatch(/stone/);
  });

  it("handles records split across every possible chunk boundary", () => {
    for (let size = 1; size <= 60; size += 7) {
      const parser = new AppleHealthParser();
      for (let i = 0; i < XML.length; i += size) parser.push(XML.slice(i, i + size));
      expect(parser.finish().weighIns).toHaveLength(3);
    }
  });

  it("warns when nothing is found", () => {
    const parser = new AppleHealthParser();
    parser.push("<HealthData></HealthData>");
    expect(parser.finish().warnings[0]).toMatch(/No body weight/);
  });

  it("streams a Blob with progress", async () => {
    const progress: number[] = [];
    const blob = new Blob([XML.repeat(1)]);
    const result = await parseAppleHealthBlob(blob, (f) => progress.push(f));
    expect(result.weighIns).toHaveLength(3);
    expect(progress.at(-1)).toBe(1);
  });
});
