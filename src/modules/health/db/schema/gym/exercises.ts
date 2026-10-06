import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { EXERCISE_MODES } from "../../../gym-types";

/**
 * Built-in catalog exercises (seeded from data/exercise-catalog.json, keyed by
 * `catalog_key`) and the user's own exercises (`is_custom`) live in one table,
 * so every routine/workout row has a real foreign key regardless of origin.
 * Muscle names stay in the dataset's free-text vocabulary; engine/muscles.ts
 * maps them onto the body-map muscles at read time.
 * See docs/prd/health/gym.md.
 */
export const gymExercises = sqliteTable(
  "health_exercises",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Dataset id (e.g. "0025"); null for custom exercises. */
    catalogKey: text("catalog_key"),
    name: text("name").notNull(),
    bodyPart: text("body_part").notNull(),
    equipment: text("equipment").notNull(),
    /** Primary muscle, dataset vocabulary ("pectorals", "lats", "quads" …). */
    target: text("target").notNull(),
    secondaryMuscles: text("secondary_muscles", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    instructions: text("instructions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    defaultMode: text("default_mode", { enum: EXERCISE_MODES }).notNull().default("reps"),
    /** Carries no external load of its own — logged weight means *added* weight. */
    isBodyweight: integer("is_bodyweight", { mode: "boolean" }).notNull().default(false),
    /** One side at a time (lunges, single-arm rows) — reps are logged as the total. */
    isUnilateral: integer("is_unilateral", { mode: "boolean" }).notNull().default(false),
    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    /** The user's own cues for this exercise (seat height, grip …). */
    notes: text("notes"),
    /** Custom exercises that history still references are archived, not deleted. */
    archivedAt: text("archived_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("health_exercises_catalog_key_idx")
      .on(table.catalogKey)
      .where(sql`${table.catalogKey} IS NOT NULL`),
    index("health_exercises_name_idx").on(table.name),
    index("health_exercises_body_part_idx").on(table.bodyPart),
    index("health_exercises_equipment_idx").on(table.equipment),
  ],
);
