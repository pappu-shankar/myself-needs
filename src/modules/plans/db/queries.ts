import { desc, eq, count, like, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { goals } from "./schema";

export type NewGoal = typeof goals.$inferInsert;

const PRIORITY_RANK = sql`CASE ${goals.priority} WHEN 'must_have' THEN 0 WHEN 'important' THEN 1 ELSE 2 END`;

/** Highest priority first, then newest within the same priority. */
export function listGoals(limit = 50) {
  return getDb()
    .select()
    .from(goals)
    .orderBy(PRIORITY_RANK, desc(goals.createdAt))
    .limit(limit)
    .all();
}

export function getGoalByIdRow(id: number) {
  return getDb().select().from(goals).where(eq(goals.id, id)).get();
}

export function countGoals() {
  return getDb().select({ value: count() }).from(goals).get()?.value ?? 0;
}

export function insertGoal(entry: NewGoal) {
  return getDb().insert(goals).values(entry).returning().get();
}

export function updateGoalProgress(id: number, progressPercent: number) {
  return getDb().update(goals).set({ progressPercent }).where(eq(goals.id, id)).returning().get();
}

export function searchGoalsByName(query: string) {
  return getDb()
    .select()
    .from(goals)
    .where(like(goals.name, `%${query}%`))
    .limit(5)
    .all();
}
