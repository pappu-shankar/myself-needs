export const HEALTH_METRIC_TYPES = ["weight", "sleep_hours", "exercise_minutes", "custom"] as const;
export type HealthMetricType = (typeof HEALTH_METRIC_TYPES)[number];

export const DEFAULT_UNITS: Record<HealthMetricType, string> = {
  weight: "kg",
  sleep_hours: "hours",
  exercise_minutes: "min",
  custom: "",
};

export const SEVERITY_LEVELS = ["mild", "moderate", "severe"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export interface HealthMetricSummary {
  label: string;
  value: number | null;
  date: string;
}
