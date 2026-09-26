import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * One row per uploaded full-body photo. The image bytes live on disk at
 * `<dataDir>/fashion-photos/<filename>` — only the reference and metadata
 * live here. `skinToneLab*` is populated by a follow-up action once
 * client-side segmentation finishes (see service/photos.ts's
 * updateSkinTone()); it's null between upload and that point. See
 * docs/prd/fashion.md.
 */
export const photos = sqliteTable("fashion_photos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  originalName: text("original_name"),
  mimeType: text("mime_type", { enum: ["image/jpeg", "image/png", "image/webp"] }).notNull(),
  widthPx: integer("width_px").notNull(),
  heightPx: integer("height_px").notNull(),
  skinToneLabL: real("skin_tone_lab_l"),
  skinToneLabA: real("skin_tone_lab_a"),
  skinToneLabB: real("skin_tone_lab_b"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
