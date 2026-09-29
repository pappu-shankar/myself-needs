import {
  countLogsForMedicationOnDate,
  getMedicationByIdRow,
  insertMedication,
  insertMedicationLog,
  listActiveMedications,
  listAllMedications,
  listRecentLogsForMedication,
  type NewMedication,
} from "../db/queries/medications";
import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";

function assertDate(value: string, label: string): void {
  try {
    parseIsoDate(value);
  } catch {
    throw new DomainError(`${label} must be a valid calendar date.`);
  }
}

export function getMedications() {
  return listAllMedications();
}

export function createMedication(entry: NewMedication) {
  if (!entry.name.trim()) throw new DomainError("Medication name is required.");
  assertDate(entry.startDate, "Start date");
  if (entry.endDate) {
    assertDate(entry.endDate, "End date");
    if (entry.endDate < entry.startDate) {
      throw new DomainError("End date cannot be before start date.");
    }
  }
  return insertMedication(entry);
}

export function logMedicationDose(medicationId: number, date: string) {
  if (!getMedicationByIdRow(medicationId)) {
    throw new DomainError("The medication no longer exists.");
  }
  assertDate(date, "Dose date");
  return insertMedicationLog({ medicationId, date });
}

export function getRecentLogsForMedication(medicationId: number) {
  return listRecentLogsForMedication(medicationId);
}

export interface TodaysMedication {
  id: number;
  name: string;
  dosage: string | null;
  frequency: string | null;
  dosesLoggedToday: number;
}

/** Every medication active today, with how many doses have already been logged today — the adherence checklist. */
export function getTodaysMedications(today: string): TodaysMedication[] {
  return listActiveMedications(today).map((m) => ({
    id: m.id,
    name: m.name,
    dosage: m.dosage,
    frequency: m.frequency,
    dosesLoggedToday: countLogsForMedicationOnDate(m.id, today),
  }));
}
