CREATE TABLE `finance_dismissed_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`dismissed_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_insights_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`credit_utilization_threshold_percent` real DEFAULT 30 NOT NULL,
	`idle_cash_months_multiple` real DEFAULT 6 NOT NULL,
	`stale_valuation_days` integer DEFAULT 90 NOT NULL,
	`recurring_pileup_threshold` integer DEFAULT 3 NOT NULL,
	`budget_headroom_percent` real DEFAULT 70 NOT NULL,
	`ltcg_approaching_percent` real DEFAULT 90 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
