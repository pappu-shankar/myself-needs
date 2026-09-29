import { and, eq, or, isNull, gte, lte, desc, like, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { medications, medicationLogs } from "./schema";

export type NewMedication = typeof medications.$inferInsert;
export type NewMedicationLog = typeof medicationLogs.$inferInsert;

/** Active as of `today`: started on/before today, and either no end date or ends on/after today. */
export function listActiveMedications(today: string) {
  return getDb()
    .select()
    .from(medications)
    .where(
      and(
        lte(medications.startDate, today),
        or(isNull(medications.endDate), gte(medications.endDate, today)),
      ),
    )
    .orderBy(medications.name)
    .all();
}

export function listAllMedications() {
  return getDb().select().from(medications).orderBy(medications.name).all();
}

export function getMedicationByIdRow(id: number) {
  return getDb().select().from(medications).where(eq(medications.id, id)).get();
}

export function insertMedication(entry: NewMedication) {
  return getDb().insert(medications).values(entry).returning().get();
}

export function insertMedicationLog(entry: NewMedicationLog) {
  return getDb().insert(medicationLogs).values(entry).returning().get();
}

/** How many doses were logged for this medication on this date — a simple adherence signal, not matched against a parsed frequency. */
export function countLogsForMedicationOnDate(medicationId: number, date: string): number {
  return (
    getDb()
      .select({ value: sql<number>`COUNT(*)` })
      .from(medicationLogs)
      .where(and(eq(medicationLogs.medicationId, medicationId), eq(medicationLogs.date, date)))
      .get()?.value ?? 0
  );
}

export function listRecentLogsForMedication(medicationId: number, limit = 14) {
  return getDb()
    .select()
    .from(medicationLogs)
    .where(eq(medicationLogs.medicationId, medicationId))
    .orderBy(desc(medicationLogs.date), desc(medicationLogs.id))
    .limit(limit)
    .all();
}

export function searchMedicationsByName(query: string) {
  return getDb()
    .select()
    .from(medications)
    .where(like(medications.name, `%${query}%`))
    .limit(5)
    .all();
}
