import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
  EXERCISE_MODES,
  IMPORT_SOURCES,
  PROGRESSION_POLICIES,
  SET_KINDS,
  TRACKED_BY,
  WORKOUT_SOURCES,
} from "../../../gym-types";
import { gymExercises } from "./exercises";
import { gymRoutines } from "./routines";
import { gymPrograms } from "./programs";

/**
 * One training session. `finished_at` null = in progress (at most one at a
 * time, enforced by the service). The body-weight weigh-in for a session is a
 * regular `health_metrics` weight row, not a column here.
 */
export const gymWorkouts = sqliteTable(
  "health_workouts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    /** ISO date-time (local, `YYYY-MM-DDTHH:mm:ss`). */
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    routineId: integer("routine_id").references(() => gymRoutines.id, { onDelete: "set null" }),
    /** Snapshot of the routine's name (or "Quick workout") at the time. */
    name: text("name").notNull(),
    /** Whole-session effort 1–10, for session-RPE training load. */
    sessionRpe: real("session_rpe"),
    notes: text("notes"),
    source: text("source", { enum: WORKOUT_SOURCES }).notNull().default("app"),
    importSource: text("import_source", { enum: IMPORT_SOURCES }),
    /** Stable key from the imported file, so re-importing never duplicates. */
    importRef: text("import_ref"),
    programId: integer("program_id").references(() => gymPrograms.id, { onDelete: "set null" }),
    programWeek: integer("program_week"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    index("health_workouts_date_idx").on(table.date),
    index("health_workouts_routine_idx").on(table.routineId),
    index("health_workouts_finished_idx").on(table.finishedAt),
    uniqueIndex("health_workouts_import_ref_idx")
      .on(table.importRef)
      .where(sql`${table.importRef} IS NOT NULL`),
  ],
);

/**
 * One exercise performed within a session. The `target_*` columns snapshot
 * what the session prescribed (and `prescription_reason` why), so progression
 * can judge a past session against what was actually asked of it even after
 * the routine changes.
 */
export const gymWorkoutExercises = sqliteTable(
  "health_workout_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => gymWorkouts.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => gymExercises.id),
    /** The routine entry this came from, if any — plain id, the entry may be edited or removed later. */
    routineExerciseId: integer("routine_exercise_id"),
    position: integer("position").notNull(),
    mode: text("mode", { enum: EXERCISE_MODES }).notNull().default("reps"),
    supersetGroup: integer("superset_group"),
    perSide: integer("per_side", { mode: "boolean" }).notNull().default(false),
    isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
    targetSets: integer("target_sets"),
    targetReps: integer("target_reps"),
    targetRepsMin: integer("target_reps_min"),
    targetWeightKg: real("target_weight_kg"),
    targetDurationSec: integer("target_duration_sec"),
    targetDistanceKm: real("target_distance_km"),
    targetRpe: real("target_rpe"),
    restSec: integer("rest_sec"),
    progressionPolicy: text("progression_policy", { enum: PROGRESSION_POLICIES }),
    /** first | up | hold | deload | off | program | autoreg — engine/types.ts. */
    prescriptionKind: text("prescription_kind"),
    prescriptionReason: text("prescription_reason"),
    notes: text("notes"),
  },
  (table) => [
    index("health_workout_exercises_workout_idx").on(table.workoutId, table.position),
    index("health_workout_exercises_exercise_idx").on(table.exerciseId),
  ],
);

/** One set. Only `completed` sets count toward history, PRs and analytics. */
export const gymWorkoutSets = sqliteTable(
  "health_workout_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workoutExerciseId: integer("workout_exercise_id")
      .notNull()
      .references(() => gymWorkoutExercises.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind", { enum: SET_KINDS }).notNull().default("working"),
    weightKg: real("weight_kg"),
    reps: integer("reps"),
    durationSec: integer("duration_sec"),
    distanceKm: real("distance_km"),
    rir: real("rir"),
    rpe: real("rpe"),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    completedAt: text("completed_at"),
    trackedBy: text("tracked_by", { enum: TRACKED_BY }).notNull().default("manual"),
    /** Camera-tracked sets: average range of motion achieved, 0–100. */
    romScore: real("rom_score"),
  },
  (table) => [index("health_workout_sets_entry_idx").on(table.workoutExerciseId, table.position)],
);
