import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * `type` distinguishes financial goals (progress derived from linked
 * finance holdings via `finance.getHoldingsByGoalId()`, composed at the
 * `app/` layer — see docs/prd/finance/goal-linked-investments.md) from
 * everything else, whose progress is a manually-updated percentage.
 * `priority` is a plain rank, not a queue — the UI sorts by it, nothing
 * more. See docs/prd/plans.md.
 *
 * `linked_goal_id` on finance rows points at this table's `id` by plain
 * value only — never a DB-level foreign key, per the cross-module
 * reference rule in docs/architecture/system-design.md.
 */
export const goals = sqliteTable("plans_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type", { enum: ["financial", "other"] })
    .notNull()
    .default("other"),
  priority: text("priority", { enum: ["must_have", "important", "aspirational"] })
    .notNull()
    .default("important"),
  targetDate: text("target_date"),
  /** Only meaningful for `type: "financial"` — the ₹ target progress is measured against. */
  targetAmount: real("target_amount"),
  /** Manually updated, only meaningful for `type: "other"` — financial goals derive progress from linked holdings instead. */
  progressPercent: real("progress_percent"),
  note: text("note"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});
