import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { E1RM_FORMULAS, EFFORT_SCALES, SEXES, WEIGHT_UNITS } from "../../../gym-types";

/**
 * Single-row (id = 1) gym preferences and the few body facts the formulas need
 * (sex for DOTS / body-fat / body-map figure, height for body fat and FFMI).
 * Every column has a default, so a missing row reads as defaults.
 */
export const gymSettings = sqliteTable("health_gym_settings", {
  id: integer("id").primaryKey(),
  sex: text("sex", { enum: SEXES }),
  heightCm: real("height_cm"),
  goalWeightKg: real("goal_weight_kg"),
  effortScale: text("effort_scale", { enum: EFFORT_SCALES }).notNull().default("none"),
  defaultRestSec: integer("default_rest_sec").notNull().default(90),
  e1rmFormula: text("e1rm_formula", { enum: E1RM_FORMULAS }).notNull().default("epley"),
  barWeightKg: real("bar_weight_kg").notNull().default(20),
  /** Plate sizes available, one entry per size (pairs are assumed). */
  platesKg: text("plates_kg", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default(sql`'[25,20,15,10,5,2.5,1.25]'`),
  /** Equipment the user has access to; empty = everything. */
  ownedEquipment: text("owned_equipment", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  weeklySessionGoal: integer("weekly_session_goal").notNull().default(3),
  sleepTargetHours: real("sleep_target_hours").notNull().default(8),
  askBodyweightOnStart: integer("ask_bodyweight_on_start", { mode: "boolean" })
    .notNull()
    .default(true),
  keepAwake: integer("keep_awake", { mode: "boolean" }).notNull().default(true),
  restSound: integer("rest_sound", { mode: "boolean" }).notNull().default(true),
  restNotifications: integer("rest_notifications", { mode: "boolean" }).notNull().default(false),
  /** Display/input unit for weights — storage stays kg. */
  weightUnit: text("weight_unit", { enum: WEIGHT_UNITS }).notNull().default("kg"),
  /** Camera rep counter speaks counts and form cues (browser speech, on device). */
  voiceCoach: integer("voice_coach", { mode: "boolean" }).notNull().default(false),
  /** Camera rep counter logs the set by itself once you stop moving. */
  cameraAutoLog: integer("camera_auto_log", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
