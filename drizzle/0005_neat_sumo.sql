CREATE TABLE `finance_scheme_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`lock_in_months` integer,
	`interest_rate` real,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_investment_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`account_id` integer,
	`units` real,
	`interest_rate` real,
	`maturity_date` text,
	`scheme_template_id` integer,
	`external_code` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scheme_template_id`) REFERENCES `finance_scheme_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `finance_investment_cash_flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`flow_type` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `finance_investment_holdings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_investment_cash_flows_holding_date_idx` ON `finance_investment_cash_flows` (`holding_id`,`date`);--> statement-breakpoint
CREATE TABLE `finance_investment_valuations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`date` text NOT NULL,
	`price_per_unit` real NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `finance_investment_holdings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `finance_investment_valuations_holding_date_idx` ON `finance_investment_valuations` (`holding_id`,`date`);