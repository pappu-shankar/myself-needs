import {
  getLatestMetric,
  insertMetric,
  listMetrics,
  listMetricsByType,
  type NewHealthMetric,
} from "../db/queries/metrics";
import type { HealthMetricType } from "../types";

export function getMetrics() {
  return listMetrics();
}

export function getMetricTrend(type: HealthMetricType, sinceDate?: string) {
  return listMetricsByType(type, sinceDate);
}

export function getLatestMetricSummary() {
  const latest = getLatestMetric();
  if (!latest) return null;
  return { label: latest.label, value: latest.value, date: latest.date };
}

export function createMetric(entry: NewHealthMetric) {
  return insertMetric(entry);
}
