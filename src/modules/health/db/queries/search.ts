import { and, asc, desc, isNull, like } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { healthMetrics } from "../schema/metrics";
import { medications } from "../schema/medications";
import { gymExercises } from "../schema/gym/exercises";
import { gymRoutines } from "../schema/gym/routines";

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

export function searchExercisesByName(query: string) {
  return getDb()
    .select({
      id: gymExercises.id,
      name: gymExercises.name,
      bodyPart: gymExercises.bodyPart,
      equipment: gymExercises.equipment,
    })
    .from(gymExercises)
    .where(and(like(gymExercises.name, `%${query}%`), isNull(gymExercises.archivedAt)))
    .orderBy(desc(gymExercises.isFavorite), asc(gymExercises.name))
    .limit(5)
    .all();
}

export function searchRoutinesByName(query: string) {
  return getDb()
    .select({ id: gymRoutines.id, name: gymRoutines.name })
    .from(gymRoutines)
    .where(and(like(gymRoutines.name, `%${query}%`), isNull(gymRoutines.archivedAt)))
    .limit(5)
    .all();
}
