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
// --- Gym & training (docs/prd/health/gym.md). Client components import
// actions from ./actions/gym/* directly, never from this barrel.
export { ensureExerciseCatalog, CATALOG_SIZE } from "./service/gym/catalog";
export {
  listExercises,
  getExercise,
  getExercisesByIds,
  listEquipmentOptions,
  listBodyParts,
  createCustomExercise,
  updateCustomExercise,
  updateExerciseNotes,
  setExerciseFavorite,
  removeCustomExercise,
  restoreCustomExercise,
  BODY_WEIGHT_EQUIPMENT,
  type Exercise,
  type ExerciseListOptions,
  type ExercisePage,
  type CustomExerciseInput,
} from "./service/gym/exercises";
export {
  listRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  duplicateRoutine,
  archiveRoutine,
  restoreRoutine,
  deleteRoutine,
  addRoutineEntry,
  updateRoutineEntry,
  removeRoutineEntry,
  reorderRoutineEntries,
  linkSuperset,
  unlinkSuperset,
  type Routine,
  type RoutineSummary,
  type RoutineDetail,
  type RoutineEntry,
  type RoutineEntryExercise,
  type RoutineEntryPatch,
} from "./service/gym/routines";
export { listTemplates, applyTemplate, type TemplateSummary } from "./service/gym/templates";
export {
  getWeekSchedule,
  setWeekdayRoutine,
  setScheduleOverride,
  clearScheduleOverride,
  listScheduleOverrides,
  getPlannedRoutineForDate,
  getWeekPlan,
  type WeekScheduleDay,
  type ScheduleOverride,
  type PlannedDay,
} from "./service/gym/schedule";
export {
  listPrograms,
  getActiveProgram,
  getProgram,
  createProgram,
  updateProgram,
  endProgram,
  deleteProgram,
  type Program,
} from "./service/gym/programs";
export {
  listTrainingMaxes,
  latestTrainingMaxes,
  setTrainingMax,
  deleteTrainingMax,
  type TrainingMax,
} from "./service/gym/training-maxes";
export {
  getGymSettings,
  updateGymSettings,
  DEFAULT_GYM_SETTINGS,
  type GymSettings,
} from "./service/gym/settings";
export {
  getActiveWorkout,
  getWorkout,
  listWorkouts,
  listWorkoutDates,
  type Workout,
  type WorkoutSet,
  type WorkoutDetail,
  type WorkoutDetailEntry,
  type WorkoutListRow,
} from "./service/gym/workouts";
export {
  getExerciseSessions,
  getRecentSessionsByExercise,
  getWorkoutRecords,
  getExerciseHistory,
  type ExerciseHistoryRow,
} from "./service/gym/history";
export {
  getBodyweightOn,
  getLatestBodyweight,
  getBodyweightSeries,
  logBodyweight,
  getSleepHoursOn,
  type BodyweightPoint,
} from "./service/gym/vitals";
export {
  addMeasurements,
  listMeasurements,
  getMeasurementSeries,
  latestMeasurements,
  deleteMeasurement,
  type BodyMeasurement,
} from "./service/gym/measurements";
export {
  upsertReadinessCheckin,
  getReadinessCheckin,
  listReadinessCheckins,
  type ReadinessCheckin,
} from "./service/gym/readiness";
export { getLandmarkOverrides } from "./service/gym/landmarks";
export {
  buildSessionPlan,
  startWorkout,
  programContext,
  type SessionPlan,
  type PlannedEntry,
  type ProgramContext,
} from "./service/gym/session-plan";
export {
  getGymStats,
  getMuscleMap,
  getReadiness,
  getRecentRecords,
  getExerciseOverview,
  getWorkoutSummary,
  getBodyOverview,
  getTrainingMaxSuggestion,
  STATS_RANGES,
  type StatsRange,
  type GymStats,
  type ReadinessOverview,
  type RecentRecord,
  type ExerciseOverview,
  type WorkoutSummary,
  type BodyOverview,
} from "./service/gym/analytics";
export { getGymOverview, getGymDashboardSummary, type GymOverview } from "./service/gym/overview";
export { getGymInsights } from "./service/gym/insights/engine";
export type { GymInsight } from "./service/gym/insights/types";
export { exportPlanFile, exportBackup } from "./service/gym/import";
export {
  listProgressPhotos,
  getProgressPhoto,
  getProgressPhotoImage,
  type ProgressPhoto,
} from "./service/gym/progress-photos";
export * from "./types";
