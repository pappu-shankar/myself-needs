import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { healthMetrics } from "../schema/metrics";
import type { HealthMetricType } from "../../types";

export type NewHealthMetric = typeof healthMetrics.$inferInsert;

export function listMetrics(limit = 50) {
  return getDb()
    .select()
    .from(healthMetrics)
    .orderBy(desc(healthMetrics.date), desc(healthMetrics.id))
    .limit(limit)
    .all();
}

export function listMetricsByType(type: HealthMetricType, sinceDate?: string) {
  return getDb()
    .select()
    .from(healthMetrics)
    .where(
      sinceDate
        ? and(eq(healthMetrics.type, type), gte(healthMetrics.date, sinceDate))
        : eq(healthMetrics.type, type),
    )
    .orderBy(healthMetrics.date)
    .all();
}

export function getLatestMetric() {
  return getDb()
    .select()
    .from(healthMetrics)
    .orderBy(desc(healthMetrics.date), desc(healthMetrics.id))
    .limit(1)
    .get();
}

export function insertMetric(entry: NewHealthMetric) {
  return getDb().insert(healthMetrics).values(entry).returning().get();
}
