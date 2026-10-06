import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymReadinessCheckins } from "../../schema/gym/readiness-checkins";

export type GymReadinessCheckin = typeof gymReadinessCheckins.$inferSelect;
export type NewGymReadinessCheckin = typeof gymReadinessCheckins.$inferInsert;

const r = gymReadinessCheckins;

/** One check-in per date: a second save that day replaces the first. */
export function upsertCheckin(row: NewGymReadinessCheckin): GymReadinessCheckin {
  const { sleepQuality, energy, soreness, stress, motivation, note = null } = row;
  return getDb()
    .insert(r)
    .values(row)
    .onConflictDoUpdate({
      target: r.date,
      set: { sleepQuality, energy, soreness, stress, motivation, note },
    })
    .returning()
    .get();
}

export function findCheckin(date: string): GymReadinessCheckin | undefined {
  return getDb().select().from(r).where(eq(r.date, date)).get();
}

/** Check-ins dated within [from, to], oldest first. */
export function listCheckinsBetween(from: string, to: string): GymReadinessCheckin[] {
  return getDb()
    .select()
    .from(r)
    .where(and(gte(r.date, from), lte(r.date, to)))
    .orderBy(asc(r.date))
    .all();
}
