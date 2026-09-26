import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { rooms } from "./rooms";

/**
 * A door or window on one of a room's 4 walls (`wall` matches the north/south/
 * east/west convention `RoomWalls` in house-viewer.tsx uses to place wall
 * meshes). `offset` is measured from that wall's start corner: along x for
 * north/south walls, along z for east/west walls. `style` is validated
 * against `DOOR_STYLES`/`WINDOW_STYLES` (types.ts) at the action layer, not a
 * DB-level enum, since the valid set depends on `type`. See docs/prd/house.md.
 */
export const openings = sqliteTable(
  "house_openings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    wall: text("wall", { enum: ["north", "south", "east", "west"] }).notNull(),
    type: text("type", { enum: ["door", "window"] }).notNull(),
    style: text("style"),
    offset: real("offset").notNull().default(0),
    width: real("width").notNull(),
    height: real("height"),
    sillHeight: real("sill_height"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_openings_room_idx").on(table.roomId)],
);
