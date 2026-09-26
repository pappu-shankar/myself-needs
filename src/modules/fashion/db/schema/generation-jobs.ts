import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { outfits } from "./outfits";

/**
 * One row per reference-sheet generation attempt against a saved outfit
 * (not one row per outfit) — retrying after a failure inserts a new row so
 * failure history is preserved rather than overwritten.
 * `comfyuiPromptId` is the self-hosted ComfyUI instance's own job id,
 * used to poll its `/history/{prompt_id}` endpoint. The poll itself is what
 * advances `status` from `running` to `done`/`failed` — there is no
 * separate background worker process. See docs/prd/fashion.md.
 */
export const generationJobs = sqliteTable(
  "fashion_generation_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    outfitId: integer("outfit_id")
      .notNull()
      .references(() => outfits.id),
    status: text("status", { enum: ["pending", "running", "done", "failed"] })
      .notNull()
      .default("pending"),
    comfyuiPromptId: text("comfyui_prompt_id"),
    errorMessage: text("error_message"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("fashion_generation_jobs_outfit_idx").on(table.outfitId)],
);
