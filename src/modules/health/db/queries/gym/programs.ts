import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymPrograms } from "../../schema/gym/programs";

export type GymProgramRow = typeof gymPrograms.$inferSelect;
export type NewGymProgramRow = typeof gymPrograms.$inferInsert;
export type GymProgramPatch = Partial<Omit<NewGymProgramRow, "id" | "createdAt">>;

/** The active program first, then newest start first. */
export function listProgramRows(limit: number, offset: number) {
  return getDb()
    .select()
    .from(gymPrograms)
    .orderBy(
      desc(sql`${gymPrograms.status} = 'active'`),
      desc(gymPrograms.startDate),
      desc(gymPrograms.id),
    )
    .limit(limit)
    .offset(offset)
    .all();
}

/** The service keeps at most one active; newest wins if that was ever violated. */
export function getActiveProgramRow() {
  return getDb()
    .select()
    .from(gymPrograms)
    .where(eq(gymPrograms.status, "active"))
    .orderBy(desc(gymPrograms.id))
    .limit(1)
    .get();
}

export function listActiveProgramIds(): number[] {
  return getDb()
    .select({ id: gymPrograms.id })
    .from(gymPrograms)
    .where(eq(gymPrograms.status, "active"))
    .orderBy(asc(gymPrograms.id))
    .all()
    .map((row) => row.id);
}

export function getProgramRow(id: number) {
  return getDb().select().from(gymPrograms).where(eq(gymPrograms.id, id)).get();
}

export function insertProgram(row: NewGymProgramRow) {
  return getDb().insert(gymPrograms).values(row).returning().get();
}

export function updateProgramRow(id: number, patch: GymProgramPatch) {
  return getDb().update(gymPrograms).set(patch).where(eq(gymPrograms.id, id)).returning().get();
}

/** Workouts logged under it keep their row with `program_id` set null. */
export function deleteProgramRow(id: number): void {
  getDb().delete(gymPrograms).where(eq(gymPrograms.id, id)).run();
}

/** Runs `work` atomically — starting a program completes the previous one in the same step. */
export function inProgramTransaction<T>(work: () => T): T {
  return getDb().transaction(() => work());
}
