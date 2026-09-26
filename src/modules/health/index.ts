/** Public surface — the only thing other modules/app routes may import from `health`. */
export {
  getMetrics,
  getMetricTrend,
  getLatestMetricSummary,
  createMetric,
} from "./service/metrics";
export {
  getMedications,
  getTodaysMedications,
  getRecentLogsForMedication,
  createMedication,
  logMedicationDose,
} from "./service/medications";
export { addMetricAction, type AddMetricState } from "./actions/metrics";
export {
  addMedicationAction,
  type AddMedicationState,
  logDoseAction,
  type LogDoseState,
} from "./actions/medications";
export { searchHealth } from "./service/search";
export * from "./types";
