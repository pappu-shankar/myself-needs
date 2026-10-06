import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  sql,
  type SQL,
} from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymExercises } from "../../schema/gym/exercises";
import { gymRoutineExercises } from "../../schema/gym/routines";
import { gymWorkoutExercises } from "../../schema/gym/workouts";

export type GymExerciseRow = typeof gymExercises.$inferSelect;
export type NewGymExerciseRow = typeof gymExercises.$inferInsert;
export type GymExercisePatch = Partial<Omit<NewGymExerciseRow, "id" | "catalogKey" | "createdAt">>;

/** Already-normalized filters — the service turns user input into these. */
export interface ExerciseRowFilter {
  /** Every word must appear somewhere in the name (case-insensitive). */
  words?: readonly string[];
  bodyPart?: string;
  equipment?: string;
  /** Primary-target terms in the dataset's vocabulary. */
  targets?: readonly string[];
  /** Only exercises using one of these equipment values. */
  equipmentIn?: readonly string[];
  favoritesOnly?: boolean;
  includeArchived?: boolean;
}

/** `%` and `_` in a search are literal characters, not wildcards. */
function likePattern(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function filterCondition(filter: ExerciseRowFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (!filter.includeArchived) conditions.push(isNull(gymExercises.archivedAt));
  // SQLite's LIKE is case-insensitive for ASCII, which covers the catalog.
  for (const word of filter.words ?? []) {
    conditions.push(sql`${gymExercises.name} LIKE ${likePattern(word)} ESCAPE '\\'`);
  }
  if (filter.bodyPart) conditions.push(eq(gymExercises.bodyPart, filter.bodyPart));
  if (filter.equipment) conditions.push(eq(gymExercises.equipment, filter.equipment));
  if (filter.targets) conditions.push(inArray(gymExercises.target, [...filter.targets]));
  if (filter.equipmentIn) conditions.push(inArray(gymExercises.equipment, [...filter.equipmentIn]));
  if (filter.favoritesOnly) conditions.push(eq(gymExercises.isFavorite, true));
  return conditions.length ? and(...conditions) : undefined;
}

/** One page of exercises: favorites first, then by name. */
export function listExerciseRows(filter: ExerciseRowFilter, limit: number, offset: number) {
  return getDb()
    .select()
    .from(gymExercises)
    .where(filterCondition(filter))
    .orderBy(
      desc(gymExercises.isFavorite),
      asc(sql`${gymExercises.name} COLLATE NOCASE`),
      asc(gymExercises.id),
    )
    .limit(limit)
    .offset(offset)
    .all();
}

export function countExerciseRows(filter: ExerciseRowFilter): number {
  return (
    getDb().select({ n: count() }).from(gymExercises).where(filterCondition(filter)).get()?.n ?? 0
  );
}

export function getExerciseRow(id: number) {
  return getDb().select().from(gymExercises).where(eq(gymExercises.id, id)).get();
}

export function listExerciseRowsByIds(ids: readonly number[]) {
  if (ids.length === 0) return [];
  return getDb()
    .select()
    .from(gymExercises)
    .where(inArray(gymExercises.id, [...ids]))
    .all();
}

/** Catalog rows by dataset key — how starter templates name their exercises. */
export function listExerciseRowsByCatalogKeys(keys: readonly string[]) {
  if (keys.length === 0) return [];
  return getDb()
    .select()
    .from(gymExercises)
    .where(and(isNotNull(gymExercises.catalogKey), inArray(gymExercises.catalogKey, [...keys])))
    .all();
}

/** Every distinct primary target — a few dozen terms, catalog plus customs. */
export function listDistinctTargets(): string[] {
  return getDb()
    .selectDistinct({ target: gymExercises.target })
    .from(gymExercises)
    .all()
    .map((row) => row.target);
}

/** Equipment values in use (archived exercises excluded), most common first. */
export function listEquipmentCounts(bodyPart?: string) {
  const n = count();
  return getDb()
    .select({ equipment: gymExercises.equipment, count: n })
    .from(gymExercises)
    .where(
      and(
        isNull(gymExercises.archivedAt),
        bodyPart ? eq(gymExercises.bodyPart, bodyPart) : undefined,
      ),
    )
    .groupBy(gymExercises.equipment)
    .orderBy(desc(n), asc(gymExercises.equipment))
    .all();
}

export function listBodyPartCounts() {
  return getDb()
    .select({ bodyPart: gymExercises.bodyPart, count: count() })
    .from(gymExercises)
    .where(isNull(gymExercises.archivedAt))
    .groupBy(gymExercises.bodyPart)
    .all();
}

/** A non-archived exercise with this name (case-insensitive), optionally ignoring one id. */
export function findActiveExerciseByName(name: string, exceptId?: number) {
  return getDb()
    .select({ id: gymExercises.id, name: gymExercises.name, isCustom: gymExercises.isCustom })
    .from(gymExercises)
    .where(
      and(
        isNull(gymExercises.archivedAt),
        sql`lower(${gymExercises.name}) = lower(${name})`,
        exceptId === undefined ? undefined : ne(gymExercises.id, exceptId),
      ),
    )
    .get();
}

export function insertExercise(row: NewGymExerciseRow) {
  return getDb().insert(gymExercises).values(row).returning().get();
}

export function updateExerciseRow(id: number, patch: GymExercisePatch) {
  return getDb().update(gymExercises).set(patch).where(eq(gymExercises.id, id)).returning().get();
}

export function deleteExerciseRow(id: number): void {
  getDb().delete(gymExercises).where(eq(gymExercises.id, id)).run();
}

/** Whether any routine entry or logged workout entry points at this exercise. */
export function isExerciseReferenced(id: number): boolean {
  const db = getDb();
  const inRoutine = db
    .select({ id: gymRoutineExercises.id })
    .from(gymRoutineExercises)
    .where(eq(gymRoutineExercises.exerciseId, id))
    .limit(1)
    .get();
  if (inRoutine) return true;
  const inWorkout = db
    .select({ id: gymWorkoutExercises.id })
    .from(gymWorkoutExercises)
    .where(eq(gymWorkoutExercises.exerciseId, id))
    .limit(1)
    .get();
  return inWorkout !== undefined;
}
