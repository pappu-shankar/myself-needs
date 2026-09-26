import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per house/renovation design being planned. The exterior shell
 * (perimeter walls + roof) is never separately modeled — it's derived from
 * the bounding footprint of each floor's rooms at render time, using the
 * roof fields here. See docs/prd/house.md.
 */
export const projects = sqliteTable("house_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  notes: text("notes"),
  roofType: text("roof_type", { enum: ["flat", "gabled", "hip"] })
    .notNull()
    .default("gabled"),
  /** Degrees from horizontal. Null/unused for a flat roof. */
  roofPitchDegrees: real("roof_pitch_degrees"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
