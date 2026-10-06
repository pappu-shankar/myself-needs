-- Phase 9 step 3.3: financial goals move into finance as `finance_goals`, and
-- `linked_goal_id` becomes a real foreign key (decision 40).
--
-- Hand-edited, because the generated version would wedge sign-in. Every
-- existing `linked_goal_id` holds a `plans_goals.id`: the table rebuilds below
-- run with foreign keys off, so the INSERTs succeed, and then the
-- `PRAGMA foreign_key_check` that `applyMigrations` runs afterwards finds every
-- one of those rows dangling, restores the pre-migration backup and fails the
-- sign-in. So the goals have to exist, under the ids the links already use,
-- before the constraint is added.
--
-- Ids are preserved rather than reassigned for exactly that reason: a remap
-- would mean rewriting every `linked_goal_id` correctly in the same statement,
-- and getting it wrong is silent — a holding would fund the wrong goal.
--
-- The plans row is kept, not deleted. There are no down-migrations
-- (decision 34), so a delete here has no inverse; instead the life-goal shell
-- stays in `plans` carrying a soft pointer, which is also what
-- docs/prd/finance/goals.md describes.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `finance_goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`target_amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`target_date` text,
	`priority` text DEFAULT 'important' NOT NULL,
	`expected_return_bps` integer,
	`volatility_bps` integer,
	`plans_goal_id` integer,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_goals_priority_date_idx` ON `finance_goals` (`priority`,`target_date`);--> statement-breakpoint
ALTER TABLE `plans_goals` ADD `finance_goal_id` integer;--> statement-breakpoint

-- Financial goals become finance goals, keeping their ids. A goal with no
-- target amount cannot: `finance_goals.target_amount_minor` is NOT NULL,
-- because a financial goal without a target has nothing to measure progress
-- against. Those are left behind and their links are queued below.
INSERT INTO `finance_goals`
  ("id", "name", "kind", "target_amount_minor", "currency", "target_date", "priority", "plans_goal_id", "notes", "created_at")
SELECT
  "id",
  "name",
  'other',
  "target_amount_minor",
  "currency",
  "target_date",
  -- plans ranks must_have/important/aspirational; finance funds in
  -- essential/important/lifestyle order. Same three tiers, different names.
  CASE "priority"
    WHEN 'must_have' THEN 'essential'
    WHEN 'aspirational' THEN 'lifestyle'
    ELSE 'important'
  END,
  "id",
  "note",
  "created_at"
FROM `plans_goals`
WHERE "type" = 'financial' AND "target_amount_minor" IS NOT NULL;--> statement-breakpoint
UPDATE `plans_goals`
SET `finance_goal_id` = `id`
WHERE EXISTS (SELECT 1 FROM `finance_goals` WHERE `finance_goals`."id" = `plans_goals`."id");--> statement-breakpoint
-- `finance_goals` reuses plans ids, so its AUTOINCREMENT counter has to start
-- above them or the next inserted goal would collide with a migrated one.
INSERT INTO `sqlite_sequence` ("name", "seq")
SELECT 'finance_goals', (SELECT COALESCE(MAX("id"), 0) FROM `finance_goals`)
WHERE NOT EXISTS (SELECT 1 FROM `sqlite_sequence` WHERE "name" = 'finance_goals')
  AND EXISTS (SELECT 1 FROM `finance_goals`);--> statement-breakpoint
UPDATE `sqlite_sequence`
SET "seq" = (SELECT COALESCE(MAX("id"), 0) FROM `finance_goals`)
WHERE "name" = 'finance_goals'
  AND "seq" < (SELECT COALESCE(MAX("id"), 0) FROM `finance_goals`);--> statement-breakpoint

-- A link that could not be kept is recorded, then cleared. Left in place it
-- would dangle and fail the foreign-key check; cleared silently it would just
-- look like the user never linked the holding.
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'goal_link_dropped', 'finance_investment_holdings', "h"."id",
  'Holding "' || "h"."name" || '" was linked to a goal that could not become a financial goal (it is a life goal, or it has no target amount). Re-link it to a financial goal.'
FROM `finance_investment_holdings` AS "h"
WHERE "h"."linked_goal_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `finance_goals` WHERE "finance_goals"."id" = "h"."linked_goal_id");--> statement-breakpoint
INSERT OR IGNORE INTO `finance_reconciliation_items` ("kind", "subject_table", "subject_id", "detail")
SELECT 'goal_link_dropped', 'finance_recurring_rules', "r"."id",
  'A recurring ' || "r"."type" || ' was linked to a goal that could not become a financial goal. Re-link it to a financial goal.'
FROM `finance_recurring_rules` AS "r"
WHERE "r"."linked_goal_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `finance_goals` WHERE "finance_goals"."id" = "r"."linked_goal_id");--> statement-breakpoint
UPDATE `finance_investment_holdings`
SET `linked_goal_id` = NULL
WHERE `linked_goal_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `finance_goals` WHERE `finance_goals`."id" = `finance_investment_holdings`.`linked_goal_id`);--> statement-breakpoint
UPDATE `finance_recurring_rules`
SET `linked_goal_id` = NULL
WHERE `linked_goal_id` IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM `finance_goals` WHERE `finance_goals`."id" = `finance_recurring_rules`.`linked_goal_id`);--> statement-breakpoint
CREATE TABLE `__new_finance_investment_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`account_id` integer,
	`entity_id` integer,
	`institution_id` integer,
	`currency` text DEFAULT 'INR' NOT NULL,
	`liquidity` text DEFAULT 'liquid' NOT NULL,
	`sector` text,
	`country` text,
	`market_cap_band` text,
	`units_scaled` integer,
	`rate_bps` integer,
	`maturity_date` text,
	`scheme_template_id` integer,
	`external_code` text,
	`is_80c_eligible` integer DEFAULT false NOT NULL,
	`linked_goal_id` integer,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`institution_id`) REFERENCES `finance_institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scheme_template_id`) REFERENCES `finance_scheme_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_goal_id`) REFERENCES `finance_goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_investment_holdings`("id", "type", "name", "account_id", "entity_id", "institution_id", "currency", "liquidity", "sector", "country", "market_cap_band", "units_scaled", "rate_bps", "maturity_date", "scheme_template_id", "external_code", "is_80c_eligible", "linked_goal_id", "notes", "archived_at", "created_at") SELECT "id", "type", "name", "account_id", "entity_id", "institution_id", "currency", "liquidity", "sector", "country", "market_cap_band", "units_scaled", "rate_bps", "maturity_date", "scheme_template_id", "external_code", "is_80c_eligible", "linked_goal_id", "notes", "archived_at", "created_at" FROM `finance_investment_holdings`;--> statement-breakpoint
DROP TABLE `finance_investment_holdings`;--> statement-breakpoint
ALTER TABLE `__new_finance_investment_holdings` RENAME TO `finance_investment_holdings`;--> statement-breakpoint
CREATE TABLE `__new_finance_recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`category_id` integer,
	`amount_minor` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`to_amount_minor` integer,
	`to_currency` text,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`note` text,
	`linked_goal_id` integer,
	`paused_at` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`linked_goal_id`) REFERENCES `finance_goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_recurring_rules`("id", "type", "account_id", "to_account_id", "category_id", "amount_minor", "currency", "to_amount_minor", "to_currency", "frequency", "start_date", "end_date", "note", "linked_goal_id", "paused_at", "archived_at", "created_at") SELECT "id", "type", "account_id", "to_account_id", "category_id", "amount_minor", "currency", "to_amount_minor", "to_currency", "frequency", "start_date", "end_date", "note", "linked_goal_id", "paused_at", "archived_at", "created_at" FROM `finance_recurring_rules`;--> statement-breakpoint
DROP TABLE `finance_recurring_rules`;--> statement-breakpoint
ALTER TABLE `__new_finance_recurring_rules` RENAME TO `finance_recurring_rules`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
