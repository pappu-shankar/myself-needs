import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { photos } from "./photos";

/**
 * A named shirt/pants color combo saved against one photo. Re-rendering an
 * outfit replays the hue-shift from `shirtColorHex`/`pantsColorHex` against
 * the original photo at load time — no second image is ever stored.
 * `photoId` is a real FK: unlike a cross-module reference, this link is
 * entirely internal to the fashion module, so the usual "plain ID, no FK"
 * rule (docs/architecture/system-design.md) doesn't apply here. See
 * docs/prd/fashion.md.
 */
export const outfits = sqliteTable(
  "fashion_outfits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    name: text("name").notNull(),
    shirtColorHex: text("shirt_color_hex").notNull(),
    pantsColorHex: text("pants_color_hex").notNull(),
    /** Snapshotted at save time from lab-color.ts's scoreContrast() against
     * the photo's cached skin tone — deliberately cached rather than
     * recomputed on every list render, since it only changes when the
     * outfit is re-saved with different colors. Null if the photo's skin
     * tone hadn't been sampled yet when this outfit was saved. */
    shirtContrastScore: text("shirt_contrast_score", { enum: ["pops", "washed_out", "neutral"] }),
    pantsContrastScore: text("pants_contrast_score", { enum: ["pops", "washed_out", "neutral"] }),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("fashion_outfits_photo_idx").on(table.photoId)],
);
