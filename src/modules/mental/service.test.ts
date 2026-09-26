import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "@/test/db";
import {
  createMedication,
  getActiveMedicationsCount,
  getMedications,
  getRecentLogsForMedication,
  getTodaysMedications,
  logMedicationDose,
} from "./service";

beforeEach(setupTestDb);
afterEach(teardownTestDb);

describe("mental service", () => {
  it("creates a medication and lists all medications alphabetically", () => {
    createMedication({ name: "Sertraline", startDate: "2026-01-01" });
    createMedication({ name: "Lithium", startDate: "2026-01-01" });

    const medications = getMedications();

    expect(medications.map((m) => m.name)).toEqual(["Lithium", "Sertraline"]);
  });

  it("logs a dose and returns it in recent logs", () => {
    const medication = createMedication({ name: "Sertraline", startDate: "2026-01-01" });

    logMedicationDose(medication.id, "2026-08-24");

    const logs = getRecentLogsForMedication(medication.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ medicationId: medication.id, date: "2026-08-24" });
  });

  it("includes only medications active on the given date", () => {
    createMedication({ name: "Ended", startDate: "2026-01-01", endDate: "2026-06-01" });
    createMedication({ name: "Ongoing", startDate: "2026-01-01" });
    createMedication({ name: "Future", startDate: "2027-01-01" });

    const todays = getTodaysMedications("2026-08-24");

    expect(todays.map((m) => m.name)).toEqual(["Ongoing"]);
  });

  it("reconciles dosesLoggedToday against logged doses for that date", () => {
    const medication = createMedication({
      name: "Sertraline",
      dosage: "50mg",
      frequency: "once daily",
      startDate: "2026-01-01",
    });

    expect(getTodaysMedications("2026-08-24")[0]).toMatchObject({
      name: "Sertraline",
      dosesLoggedToday: 0,
    });

    logMedicationDose(medication.id, "2026-08-24");
    expect(getTodaysMedications("2026-08-24")[0]).toMatchObject({ dosesLoggedToday: 1 });
  });

  it("counts active medications for the dashboard summary", () => {
    expect(getActiveMedicationsCount("2026-08-24")).toBe(0);

    createMedication({ name: "Sertraline", startDate: "2026-01-01" });
    createMedication({ name: "Ended", startDate: "2026-01-01", endDate: "2026-06-01" });

    expect(getActiveMedicationsCount("2026-08-24")).toBe(1);
  });
});
