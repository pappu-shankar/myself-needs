import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";
import { createMetric, getMetricTrend } from "../metrics";
import { findLatestMetricOn, findLatestMetricOnOrBefore } from "../../db/queries/gym/vitals";

/**
 * Body weight and sleep as the gym reads them. Both stay ordinary
 * `health_metrics` rows — a workout's weigh-in is a normal weight entry — so
 * the health trend charts, the dashboard and the gym math share one source.
 */

export interface BodyweightPoint {
  date: string;
  weightKg: number;
}

export const BODYWEIGHT_MIN_KG = 20;
export const BODYWEIGHT_MAX_KG = 400;

function requireDate(date: string): void {
  try {
    parseIsoDate(date);
  } catch {
    throw new DomainError("Date must be a valid calendar date.");
  }
}

function toPoint(row: { date: string; value: number | null } | undefined): BodyweightPoint | null {
  return row && row.value != null ? { date: row.date, weightKg: row.value } : null;
}

/** The weight that applied on `date`: the latest entry on or before it. */
export function getBodyweightOn(date: string): BodyweightPoint | null {
  requireDate(date);
  return toPoint(findLatestMetricOnOrBefore("weight", date));
}

export function getLatestBodyweight(): BodyweightPoint | null {
  return toPoint(findLatestMetricOnOrBefore("weight"));
}

/** Weight entries oldest first, optionally from `sinceDate` on. */
export function getBodyweightSeries(sinceDate?: string): BodyweightPoint[] {
  if (sinceDate) requireDate(sinceDate);
  return getMetricTrend("weight", sinceDate).flatMap((row) =>
    row.value != null ? [{ date: row.date, weightKg: row.value }] : [],
  );
}

/** Records a weigh-in as a regular weight metric. */
export function logBodyweight(date: string, weightKg: number, note?: string | null) {
  requireDate(date);
  if (!Number.isFinite(weightKg) || weightKg < BODYWEIGHT_MIN_KG || weightKg > BODYWEIGHT_MAX_KG) {
    throw new DomainError(
      `Body weight must be between ${BODYWEIGHT_MIN_KG} and ${BODYWEIGHT_MAX_KG} kg.`,
    );
  }
  return createMetric({
    type: "weight",
    date,
    label: "Weight",
    value: weightKg,
    unit: "kg",
    note: note?.trim() || null,
  });
}

/** Hours slept logged for `date` (the latest entry that day), or null. */
export function getSleepHoursOn(date: string): number | null {
  requireDate(date);
  return findLatestMetricOn("sleep_hours", date)?.value ?? null;
}
