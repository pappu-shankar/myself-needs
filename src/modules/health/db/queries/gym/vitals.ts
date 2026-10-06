import { and, desc, eq, isNotNull, lte } from "drizzle-orm";
import { getDb } from "@/modules/core/db/client";
import { healthMetrics } from "../../schema/metrics";
import type { HealthMetricType } from "../../../types";

/**
 * Point lookups into `health_metrics` the gym needs (the weigh-in that applied
 * on a date, last night's sleep). Writes and series reads go through the
 * existing metrics service; these are the reads it doesn't have.
 */

/** The newest valued entry of `type` dated on or before `date` (any date when omitted). */
export function findLatestMetricOnOrBefore(type: HealthMetricType, date?: string) {
  return getDb()
    .select({ date: healthMetrics.date, value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.type, type),
        isNotNull(healthMetrics.value),
        date ? lte(healthMetrics.date, date) : undefined,
      ),
    )
    .orderBy(desc(healthMetrics.date), desc(healthMetrics.id))
    .limit(1)
    .get();
}

/** The most recently entered valued `type` entry dated exactly `date`. */
export function findLatestMetricOn(type: HealthMetricType, date: string) {
  return getDb()
    .select({ date: healthMetrics.date, value: healthMetrics.value })
    .from(healthMetrics)
    .where(
      and(
        eq(healthMetrics.type, type),
        eq(healthMetrics.date, date),
        isNotNull(healthMetrics.value),
      ),
    )
    .orderBy(desc(healthMetrics.id))
    .limit(1)
    .get();
}
