import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { rooms } from "./rooms";

/**
 * An actual light source in a room — rendered as both a small fixture marker
 * and a real `pointLight`/`spotLight` that lights the scene, unlike
 * `house_fixtures` (plumbing/electrical utility points, markers only).
 * `x`/`z` is room-relative; `height` is measured from the floor (mounting
 * height), not from the room's origin corner. See docs/prd/house.md.
 */
export const lightFixtures = sqliteTable(
  "house_light_fixtures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    name: text("name").notNull(),
    type: text("type", { enum: ["ceiling", "wall", "pendant", "floor_lamp"] }).notNull(),
    x: real("x").notNull().default(0),
    z: real("z").notNull().default(0),
    height: real("height"),
    color: text("color"),
    intensity: real("intensity"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_light_fixtures_room_idx").on(table.roomId)],
);
