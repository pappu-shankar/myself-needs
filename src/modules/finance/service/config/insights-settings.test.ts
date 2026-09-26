import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { getInsightsSettingsView, setInsightsSettings } from "./insights-settings";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("insights settings", () => {
  it("round-trips a patched setting through getInsightsSettingsView/setInsightsSettings", () => {
    expect(getInsightsSettingsView().staleValuationDays).toBe(90);

    setInsightsSettings({ staleValuationDays: 30 });

    expect(getInsightsSettingsView().staleValuationDays).toBe(30);
  });
});
