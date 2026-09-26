import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { rooms } from "./rooms";

/**
 * A simple placeable item within a room — rendered as a single colored box
 * (by `category`), not a 3D model. `x`/`z` is the room-relative position of
 * its near corner (same convention as room/opening coordinates), `rotation_degrees`
 * its orientation (0 = width along +x). See docs/prd/house.md.
 */
export const furniture = sqliteTable(
  "house_furniture",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["bed", "sofa", "table", "chair", "wardrobe", "desk", "tv_unit", "other"],
    }).notNull(),
    x: real("x").notNull().default(0),
    z: real("z").notNull().default(0),
    width: real("width").notNull(),
    depth: real("depth").notNull(),
    height: real("height").notNull(),
    rotationDegrees: real("rotation_degrees").notNull().default(0),
    color: text("color"),
    material: text("material", { enum: ["matte", "satin", "gloss", "metal"] }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_furniture_room_idx").on(table.roomId)],
);
