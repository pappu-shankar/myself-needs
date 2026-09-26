import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";
import { floors } from "./floors";

/**
 * One straight flight connecting two floors. `x`/`z` is the flight's starting
 * corner (same world plane as room coordinates), `run` is its horizontal
 * length, `rotationDegrees` its direction (0 = along +x). `railingSide`/
 * `railingHeight` control a simple rail rendered alongside the flight (default
 * ~0.9m, both sides). A switchback stair is entered as two or more flight rows
 * placed adjacently — there's no single multi-turn stair entity in v1. See
 * docs/prd/house.md.
 */
export const stairs = sqliteTable(
  "house_stairs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    fromFloorId: integer("from_floor_id")
      .notNull()
      .references(() => floors.id),
    toFloorId: integer("to_floor_id")
      .notNull()
      .references(() => floors.id),
    name: text("name").notNull(),
    x: real("x").notNull().default(0),
    z: real("z").notNull().default(0),
    width: real("width").notNull(),
    run: real("run").notNull(),
    rotationDegrees: real("rotation_degrees").notNull().default(0),
    railingSide: text("railing_side", { enum: ["none", "left", "right", "both"] })
      .notNull()
      .default("both"),
    railingHeight: real("railing_height"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_stairs_project_idx").on(table.projectId)],
);
