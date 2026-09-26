import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { photos } from "./photos";

/**
 * A cached physique summary for one photo — computed once client-side
 * (landmarks + person mask -> ratios -> categories -> description) right
 * after pose/segmentation analysis finishes, so it isn't recomputed on
 * every visit. `ratiosJson`/`categoriesJson` are stored as JSON text
 * rather than individual columns: both are always read/written as one
 * unit by client code and never filtered/queried in SQL, unlike a real
 * foreign key — see docs/prd/fashion.md.
 */
export const physiques = sqliteTable(
  "fashion_physiques",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    photoId: integer("photo_id")
      .notNull()
      .references(() => photos.id),
    ratiosJson: text("ratios_json").notNull(),
    categoriesJson: text("categories_json").notNull(),
    description: text("description").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("fashion_physiques_photo_idx").on(table.photoId)],
);
