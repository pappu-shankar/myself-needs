import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { floors } from "./floors";

/**
 * `x`/`z` are the room's position on its floor's plan (meters, horizontal
 * plane — `z` rather than `y` since `y` is vertical in the 3D viewer).
 * `wallHeight` overrides the floor's default when set. See docs/prd/house.md.
 */
export const rooms = sqliteTable(
  "house_rooms",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    floorId: integer("floor_id")
      .notNull()
      .references(() => floors.id),
    name: text("name").notNull(),
    type: text("type", {
      enum: [
        "bedroom",
        "bathroom",
        "kitchen",
        "living",
        "dining",
        "hallway",
        "garage",
        "balcony",
        "other",
      ],
    }).notNull(),
    x: real("x").notNull().default(0),
    z: real("z").notNull().default(0),
    width: real("width").notNull(),
    depth: real("depth").notNull(),
    wallHeight: real("wall_height"),
    color: text("color"),
    material: text("material", { enum: ["matte", "satin", "gloss", "metal"] }),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("house_rooms_floor_idx").on(table.floorId)],
);
