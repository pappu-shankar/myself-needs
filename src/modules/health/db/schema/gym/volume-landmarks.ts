import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * The user's overrides of the weekly hard-set landmarks per muscle (MEV / MAV
 * range / MRV). Holds only overrides — muscles without a row use the defaults
 * in engine/volume.ts.
 */
export const gymVolumeLandmarks = sqliteTable("health_volume_landmarks", {
  muscle: text("muscle").primaryKey(),
  mev: integer("mev").notNull(),
  mavLow: integer("mav_low").notNull(),
  mavHigh: integer("mav_high").notNull(),
  mrv: integer("mrv").notNull(),
});
