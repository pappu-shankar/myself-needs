import {
  countLogsForMedicationOnDate,
  insertMedication,
  insertMedicationLog,
  listActiveMedications,
  listAllMedications,
  listRecentLogsForMedication,
  type NewMedication,
} from "../db/queries/medications";

export function getMedications() {
  return listAllMedications();
}

export function createMedication(entry: NewMedication) {
  return insertMedication(entry);
}

export function logMedicationDose(medicationId: number, date: string) {
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
