import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { currencyColumn, minorAmount } from "../currency";
import { archivableColumns } from "../lifecycle";

/**
 * Financial goals live here, not in `plans`.
 *
 * Funding a goal and estimating its success probability need the portfolio,
 * allocation and cash-flow data only finance holds, and modules never import
 * each other — so keeping goals in `plans` would force that maths up into the
 * `src/app/` route layer, outside any module, where neither the risk engine
 * nor anything else could test or reuse it.
 *
 * Non-financial life goals stay in `plans` and may point here through a plain
 * soft-pointer ID column. See docs/prd/finance/goals.md.
 */
export const GOAL_KINDS = [
  "retirement",
  "education",
  "home",
  "emergency_fund",
  "vehicle",
  "travel",
  "other",
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** Funding order when surplus cannot cover everything: essential first, then
 * important, then lifestyle; earliest target date first within a tier. */
export const GOAL_PRIORITIES = ["essential", "important", "lifestyle"] as const;
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];

export const goals = sqliteTable(
  "finance_goals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind", { enum: GOAL_KINDS }).notNull().default("other"),
    /** The target in **today's** money. Inflation is applied in the projection
     * and shown there, rather than baked into a stored figure that would then
     * disagree with the assumption it was computed under. */
    targetAmountMinor: minorAmount("target_amount_minor").notNull(),
    currency: currencyColumn(),
    targetDate: text("target_date"),
    priority: text("priority", { enum: GOAL_PRIORITIES }).notNull().default("important"),
    /** Expected annual return and volatility for this goal's Monte Carlo, in
     * integer basis points. Null means "derive from the linked asset mix" —
     * stored only once the user overrides it, so a default that improves later
     * is not frozen into every existing goal. Visible and editable, never a
     * hidden assumption behind a percentage. */
    expectedReturnBps: integer("expected_return_bps"),
    volatilityBps: integer("volatility_bps"),
    /**
     * A goal this one was migrated from in the `plans` module, so the life-goal
     * shell there and the financial goal here stay recognisably the same thing.
     * A plain ID with no foreign key: cross-module references never carry one.
     */
    plansGoalId: integer("plans_goal_id"),
    notes: text("notes"),
    ...archivableColumns(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [index("finance_goals_priority_date_idx").on(table.priority, table.targetDate)],
);
