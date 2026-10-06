import { sqliteTable, text, integer, blob, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { PHOTO_POSES } from "../../../gym-types";

/**
 * Progress photos live inside the encrypted database (unlike fashion's
 * on-disk photos) — body photos are among the most sensitive things in the
 * vault. Clients downscale before upload, so rows stay a few hundred KB.
 * `landmarks` keeps the pose keypoints found at capture time, used to line
 * photos up for side-by-side comparison.
 */
export const gymProgressPhotos = sqliteTable(
  "health_progress_photos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    pose: text("pose", { enum: PHOTO_POSES }).notNull(),
    image: blob("image", { mode: "buffer" }).notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** Normalized [x, y, visibility] per BlazePose landmark, or null if no pose was found. */
    landmarks: text("landmarks", { mode: "json" }).$type<Array<[number, number, number]> | null>(),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("health_progress_photos_pose_date_idx").on(table.pose, table.date)],
);
