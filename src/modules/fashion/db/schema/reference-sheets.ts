import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { generationJobs } from "./generation-jobs";

/** The final composited reference sheet for one completed generation job.
 * The individual raw panels that went into it live in
 * fashion_reference_sheet_images, not here — see reference-sheet-images.ts. */
export const referenceSheets = sqliteTable("fashion_reference_sheets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id")
    .notNull()
    .references(() => generationJobs.id),
  compositeFilename: text("composite_filename").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
