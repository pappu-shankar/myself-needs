import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { rooms } from "./rooms";

/**
 * An override for one of a room's 4 walls (see `RoomWalls`' wall convention)
 * — `solid` (the default, no row needed), `open` (no wall at all), `railing`
 * (a low parapet + rail, for balcony edges and open-concept landings/hallways
 * overlooking a floor below), or `painted` (still solid, but `color`
 * overrides the room's own color for just this one wall). At most one row is
 * expected per room+wall; if more exist, the renderer uses the last one. See
 * docs/prd/house.md.
 */
export const wallStyles = sqliteTable(
  "house_wall_styles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    wall: text("wall", { enum: ["north", "south", "east", "west"] }).notNull(),
    style: text("style", { enum: ["open", "railing", "painted"] }).notNull(),
    railingHeight: real("railing_height"),
    color: text("color"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_wall_styles_room_idx").on(table.roomId)],
);
