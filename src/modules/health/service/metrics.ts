import {
  getLatestMetric,
  insertMetric,
  listMetrics,
  listMetricsByType,
  type NewHealthMetric,
} from "../db/queries/metrics";
import type { HealthMetricType } from "../types";
import { DomainError } from "@/modules/core/errors";
import { parseIsoDate } from "@/lib/dates";

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
  if (!entry.label.trim()) throw new DomainError("Metric label is required.");
  try {
    parseIsoDate(entry.date);
  } catch {
    throw new DomainError("Metric date must be a valid calendar date.");
  }
  if (entry.value != null && (!Number.isFinite(entry.value) || entry.value < 0)) {
    throw new DomainError("Metric value must be a non-negative number.");
  }
  return insertMetric(entry);
}
