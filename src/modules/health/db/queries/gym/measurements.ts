import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { gymBodyMeasurements } from "../../schema/gym/body-measurements";
import type { MeasurementSite } from "../../../gym-types";

export type GymBodyMeasurement = typeof gymBodyMeasurements.$inferSelect;
export type NewGymBodyMeasurement = typeof gymBodyMeasurements.$inferInsert;

const m = gymBodyMeasurements;

export interface MeasurementFilters {
  site?: MeasurementSite;
  /** Dated on or after. */
  from?: string;
}

function filterCondition({ site, from }: MeasurementFilters) {
  return and(site ? eq(m.site, site) : undefined, from ? gte(m.date, from) : undefined);
}

/** One statement, so a multi-site entry lands all-or-nothing. */
export function insertMeasurementRows(rows: NewGymBodyMeasurement[]): GymBodyMeasurement[] {
  return getDb().insert(m).values(rows).returning().all();
}

export function listMeasurementRows(
  filters: MeasurementFilters,
  limit: number,
  offset: number,
): GymBodyMeasurement[] {
  return getDb()
    .select()
    .from(m)
    .where(filterCondition(filters))
    .orderBy(desc(m.date), desc(m.id))
    .limit(limit)
    .offset(offset)
    .all();
}

export function countMeasurementRows(filters: MeasurementFilters): number {
  return getDb().select({ n: count() }).from(m).where(filterCondition(filters)).get()?.n ?? 0;
}

/** Every reading of one site, oldest first (uses the site+date index). */
export function listMeasurementSeries(site: MeasurementSite) {
  return getDb()
    .select({ id: m.id, date: m.date, value: m.value })
    .from(m)
    .where(eq(m.site, site))
    .orderBy(asc(m.date), asc(m.id))
    .all();
}

/** The newest reading per site, one row per site that has any. */
export function listLatestPerSite() {
  const db = getDb();
  const ranked = db.$with("ranked_measurements").as(
    db
      .select({
        site: m.site,
        value: m.value,
        date: m.date,
        rank: sql<number>`row_number() over (partition by ${m.site} order by ${m.date} desc, ${m.id} desc)`.as(
          "site_rank",
        ),
      })
      .from(m),
  );
  return db
    .with(ranked)
    .select({ site: ranked.site, value: ranked.value, date: ranked.date })
    .from(ranked)
    .where(eq(ranked.rank, 1))
    .all();
}

export function findMeasurement(id: number): GymBodyMeasurement | undefined {
  return getDb().select().from(m).where(eq(m.id, id)).get();
}

export function deleteMeasurementRow(id: number): void {
  getDb().delete(m).where(eq(m.id, id)).run();
}
