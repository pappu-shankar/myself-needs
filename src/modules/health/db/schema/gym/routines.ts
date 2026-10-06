import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { EXERCISE_MODES, LOADING_SCHEMES, PROGRESSION_POLICIES } from "../../../gym-types";
import { gymExercises } from "./exercises";

/** A reusable workout template ("Push Day"). See docs/prd/health/gym.md. */
export const gymRoutines = sqliteTable("health_routines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  notes: text("notes"),
  /** Default progression rule for the routine's entries (each can override). */
  progressionPolicy: text("progression_policy", { enum: PROGRESSION_POLICIES })
    .notNull()
    .default("linear"),
  position: integer("position").notNull().default(0),
  archivedAt: text("archived_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

/**
 * One planned exercise inside a routine, in `position` order. Adjacent entries
 * sharing a `superset_group` are performed back-to-back with one rest after
 * the group. For double progression `reps` is the top of the range and
 * `reps_min` the bottom.
 */
export const gymRoutineExercises = sqliteTable(
  "health_routine_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    routineId: integer("routine_id")
      .notNull()
      .references(() => gymRoutines.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => gymExercises.id),
    position: integer("position").notNull(),
    mode: text("mode", { enum: EXERCISE_MODES }).notNull().default("reps"),
    sets: integer("sets").notNull().default(3),
    reps: integer("reps"),
    repsMin: integer("reps_min"),
    weightKg: real("weight_kg"),
    durationSec: integer("duration_sec"),
    distanceKm: real("distance_km"),
    /** Null = the settings' default rest. */
    restSec: integer("rest_sec"),
    supersetGroup: integer("superset_group"),
    perSide: integer("per_side", { mode: "boolean" }).notNull().default(false),
    isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
    /** Null = inherit the routine's policy. */
    progressionPolicy: text("progression_policy", { enum: PROGRESSION_POLICIES }),
    /** Load step for progression; null = engine default for the body part. */
    incrementKg: real("increment_kg"),
    /** When set (e.g. 8), the load is auto-regulated from the e1RM so the
     * prescribed reps land at this RPE. */
    targetRpe: real("target_rpe"),
    scheme: text("scheme", { enum: LOADING_SCHEMES }).notNull().default("standard"),
    notes: text("notes"),
  },
  (table) => [
    index("health_routine_exercises_routine_idx").on(table.routineId, table.position),
    index("health_routine_exercises_exercise_idx").on(table.exerciseId),
  ],
);
