import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * A single garment (shirt or pants) the user owns, uploaded as its own
 * front-facing photo independent of any specific full-body photo — this is
 * the "wardrobe": garments are uploaded once and can be tried on any
 * character. `representativeColor*` is extracted client-side from the
 * photo (background removed first — see client/garment-color.ts) and
 * cached here so contrast scoring against a photo's skin tone doesn't need
 * to re-read the image file. See docs/prd/fashion.md.
 */
export const garments = sqliteTable("fashion_garments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  category: text("category", { enum: ["shirt", "pants"] }).notNull(),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type", { enum: ["image/jpeg", "image/png", "image/webp"] }).notNull(),
  representativeColorLabL: real("representative_color_lab_l").notNull(),
  representativeColorLabA: real("representative_color_lab_a").notNull(),
  representativeColorLabB: real("representative_color_lab_b").notNull(),
  /** Cached hex of the same LAB value, for display swatches without a
   * LAB->RGB conversion at render time. */
  representativeColorHex: text("representative_color_hex").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
