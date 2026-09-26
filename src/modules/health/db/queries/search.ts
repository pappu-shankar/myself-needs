import { like } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { healthMetrics } from "../schema/metrics";
import { medications } from "../schema/medications";

export function searchMetricsByLabel(query: string) {
  return getDb()
    .select()
    .from(healthMetrics)
    .where(like(healthMetrics.label, `%${query}%`))
    .limit(5)
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
