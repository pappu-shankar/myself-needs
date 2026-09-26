import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { floors } from "./floors";

/**
 * A point-like utility element on a floor's plan — water inlet, sump, septic
 * tank, overhead tank, drain outlet, electrical panel — that doesn't belong to
 * any one room. See docs/prd/house.md.
 */
export const fixtures = sqliteTable(
  "house_fixtures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    floorId: integer("floor_id")
      .notNull()
      .references(() => floors.id),
    name: text("name").notNull(),
    category: text("category", {
      enum: [
        "water_inlet",
        "sump",
        "septic_tank",
        "overhead_tank",
        "drain_outlet",
        "electrical_panel",
        "other",
      ],
    }).notNull(),
    x: real("x").notNull().default(0),
    z: real("z").notNull().default(0),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_fixtures_floor_idx").on(table.floorId)],
);
