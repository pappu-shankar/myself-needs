import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./projects";

/**
 * `level` orders floors vertically (0 = ground, negative = basement,
 * positive = upper) and drives each floor's cumulative Y offset in the 3D
 * viewer — see service/model.ts. `floorHeight` (meters) is the default wall
 * height for this floor's rooms, overridable per room.
 */
export const floors = sqliteTable(
  "house_floors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    name: text("name").notNull(),
    level: integer("level").notNull().default(0),
    floorHeight: real("floor_height").notNull().default(3),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_floors_project_idx").on(table.projectId)],
);
