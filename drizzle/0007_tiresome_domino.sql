CREATE TABLE `finance_tax_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`eighty_c_limit` real DEFAULT 150000 NOT NULL,
	`eighty_d_limit` real DEFAULT 25000 NOT NULL,
	`equity_ltcg_threshold_months` integer DEFAULT 12 NOT NULL,
	`equity_ltcg_exemption` real DEFAULT 125000 NOT NULL,
	`equity_ltcg_rate` real DEFAULT 12.5 NOT NULL,
	`equity_stcg_rate` real DEFAULT 20 NOT NULL,
	`other_ltcg_threshold_months` integer DEFAULT 24 NOT NULL,
	`other_ltcg_rate` real DEFAULT 20 NOT NULL,
	`other_stcg_rate` real DEFAULT 30 NOT NULL,
	`standard_deduction_old` real DEFAULT 50000 NOT NULL,
	`standard_deduction_new` real DEFAULT 75000 NOT NULL,
	`cess_percent` real DEFAULT 4 NOT NULL,
	`rebate_87a_threshold_old` real DEFAULT 500000 NOT NULL,
	`rebate_87a_threshold_new` real DEFAULT 700000 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_tax_slabs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`regime` text NOT NULL,
	`upto_amount` real,
	`rate_percent` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `finance_investment_holdings` ADD `is_80c_eligible` integer DEFAULT false NOT NULL;