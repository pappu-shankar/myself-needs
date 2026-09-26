import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { referenceSheets } from "./reference-sheets";

/**
 * One row per raw generated panel (~12 per sheet: 5 body angles, 2 garment
 * flat-lays, ~5 detail crops) before compositing — normalized rows rather
 * than a wide sparse-column row, so the compositor can be re-run later
 * without re-generating images. See docs/prd/fashion.md.
 */
export const referenceSheetImages = sqliteTable(
  "fashion_reference_sheet_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    referenceSheetId: integer("reference_sheet_id")
      .notNull()
      .references(() => referenceSheets.id),
    kind: text("kind", {
      enum: [
        "angle_front",
        "angle_back",
        "angle_left",
        "angle_right",
        "angle_three_quarter",
        "flat_front",
        "flat_back",
        "detail_collar",
        "detail_fabric",
        "detail_stitching",
      ],
    }).notNull(),
    filename: text("filename").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [index("fashion_reference_sheet_images_sheet_idx").on(table.referenceSheetId)],
);
