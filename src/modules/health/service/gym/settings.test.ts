import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import { DEFAULT_GYM_SETTINGS, getGymSettings, updateGymSettings } from "./settings";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("gym settings", () => {
  it("reads defaults before anything is saved, matching the column defaults", () => {
    expect(getGymSettings()).toEqual(DEFAULT_GYM_SETTINGS);
    const saved = updateGymSettings({});
    const { updatedAt, ...rest } = saved;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { updatedAt: _default, ...defaults } = DEFAULT_GYM_SETTINGS;
    expect(rest).toEqual(defaults);
    expect(updatedAt).toEqual(expect.any(String));
  });

  it("saves only the given fields and normalizes lists", () => {
    updateGymSettings({ heightCm: 180, sex: "male" });
    const saved = updateGymSettings({
      platesKg: [2.5, 20, 20, 1.25],
      ownedEquipment: [" Dumbbell", "dumbbell", "Barbell", ""],
      keepAwake: false,
    });
    expect(saved).toMatchObject({
      heightCm: 180,
      sex: "male",
      platesKg: [20, 2.5, 1.25],
      ownedEquipment: ["dumbbell", "barbell"],
      keepAwake: false,
      restSound: true,
    });
    expect(getGymSettings()).toEqual(saved);
    expect(updateGymSettings({ heightCm: null, sex: null })).toMatchObject({
      heightCm: null,
      sex: null,
    });
  });

  it("validates every range", () => {
    const bad: Array<[Parameters<typeof updateGymSettings>[0], string]> = [
      [{ defaultRestSec: -1 }, "Rest"],
      [{ defaultRestSec: 901 }, "Rest"],
      [{ defaultRestSec: 60.5 }, "Rest"],
      [{ barWeightKg: -1 }, "Bar weight"],
      [{ barWeightKg: 51 }, "Bar weight"],
      [{ platesKg: [0] }, "Plates"],
      [{ platesKg: [51] }, "Plates"],
      [{ platesKg: [] }, "at least one"],
      [{ weeklySessionGoal: 0 }, "Weekly goal"],
      [{ weeklySessionGoal: 15 }, "Weekly goal"],
      [{ sleepTargetHours: 2 }, "Sleep target"],
      [{ sleepTargetHours: 15 }, "Sleep target"],
      [{ heightCm: 99 }, "Height"],
      [{ heightCm: 251 }, "Height"],
      [{ goalWeightKg: 19 }, "Goal weight"],
      [{ goalWeightKg: 401 }, "Goal weight"],
      [{ effortScale: "feel" as never }, "effort scale"],
      [{ e1rmFormula: "guess" as never }, "1RM formula"],
    ];
    for (const [patch, message] of bad) {
      expect(() => updateGymSettings(patch), JSON.stringify(patch)).toThrow(message);
    }
    expect(getGymSettings().updatedAt).toBeNull();
  });
});

describe("weight unit", () => {
  it("swaps an untouched kg setup to a 45 lb bar and standard lb plates, and back", () => {
    const lb = updateGymSettings({ weightUnit: "lb" });
    expect(lb.weightUnit).toBe("lb");
    expect(lb.barWeightKg).toBeCloseTo(20.412, 3);
    expect(lb.platesKg[0]).toBeCloseTo(20.412, 3); // 45 lb
    const kg = updateGymSettings({ weightUnit: "kg" });
    expect(kg.barWeightKg).toBe(20);
    expect(kg.platesKg).toEqual([25, 20, 15, 10, 5, 2.5, 1.25]);
  });

  it("keeps a customised bar and plates when the unit changes", () => {
    updateGymSettings({ barWeightKg: 15, platesKg: [20, 10] });
    const lb = updateGymSettings({ weightUnit: "lb" });
    expect(lb.barWeightKg).toBe(15);
    expect(lb.platesKg).toEqual([20, 10]);
  });
});
