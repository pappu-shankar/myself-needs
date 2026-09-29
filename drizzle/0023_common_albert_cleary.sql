-- Ledger money moves from REAL rupees to INTEGER paise (see src/modules/finance/db/schema/money.ts).
-- The copy statements below were hand-edited to convert values: CAST(ROUND(x * 100) AS INTEGER).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`opening_balance` integer DEFAULT 0 NOT NULL,
	`credit_limit` integer,
	`interest_rate` real,
	`original_amount` integer,
	`emi_amount` integer,
	`tenure_months` integer,
	`exclude_from_net_worth` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_finance_accounts`("id", "name", "type", "opening_balance", "credit_limit", "interest_rate", "original_amount", "emi_amount", "tenure_months", "exclude_from_net_worth", "created_at") SELECT "id", "name", "type", CAST(ROUND("opening_balance" * 100) AS INTEGER), CAST(ROUND("credit_limit" * 100) AS INTEGER), "interest_rate", CAST(ROUND("original_amount" * 100) AS INTEGER), CAST(ROUND("emi_amount" * 100) AS INTEGER), "tenure_months", "exclude_from_net_worth", "created_at" FROM `finance_accounts`;--> statement-breakpoint
DROP TABLE `finance_accounts`;--> statement-breakpoint
ALTER TABLE `__new_finance_accounts` RENAME TO `finance_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_finance_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`monthly_limit` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_budgets`("id", "category_id", "monthly_limit", "effective_from", "created_at") SELECT "id", "category_id", CAST(ROUND("monthly_limit" * 100) AS INTEGER), "effective_from", "created_at" FROM `finance_budgets`;--> statement-breakpoint
DROP TABLE `finance_budgets`;--> statement-breakpoint
ALTER TABLE `__new_finance_budgets` RENAME TO `finance_budgets`;--> statement-breakpoint
CREATE INDEX `finance_budgets_category_effective_idx` ON `finance_budgets` (`category_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `__new_finance_insurance_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`policy_number` text,
	`sum_assured` integer,
	`premium_amount` integer NOT NULL,
	`premium_frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`renewal_date` text,
	`notes` text,
	`is_80c_eligible` integer DEFAULT false NOT NULL,
	`is_80d_eligible` integer DEFAULT false NOT NULL,
	`recurring_rule_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `finance_recurring_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_insurance_policies`("id", "type", "provider", "name", "policy_number", "sum_assured", "premium_amount", "premium_frequency", "start_date", "renewal_date", "notes", "is_80c_eligible", "is_80d_eligible", "recurring_rule_id", "created_at") SELECT "id", "type", "provider", "name", "policy_number", CAST(ROUND("sum_assured" * 100) AS INTEGER), CAST(ROUND("premium_amount" * 100) AS INTEGER), "premium_frequency", "start_date", "renewal_date", "notes", "is_80c_eligible", "is_80d_eligible", "recurring_rule_id", "created_at" FROM `finance_insurance_policies`;--> statement-breakpoint
DROP TABLE `finance_insurance_policies`;--> statement-breakpoint
ALTER TABLE `__new_finance_insurance_policies` RENAME TO `finance_insurance_policies`;--> statement-breakpoint
CREATE TABLE `__new_finance_investment_cash_flows` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`holding_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`flow_type` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`holding_id`) REFERENCES `finance_investment_holdings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_investment_cash_flows`("id", "holding_id", "date", "amount", "flow_type", "created_at") SELECT "id", "holding_id", "date", CAST(ROUND("amount" * 100) AS INTEGER), "flow_type", "created_at" FROM `finance_investment_cash_flows`;--> statement-breakpoint
DROP TABLE `finance_investment_cash_flows`;--> statement-breakpoint
ALTER TABLE `__new_finance_investment_cash_flows` RENAME TO `finance_investment_cash_flows`;--> statement-breakpoint
CREATE INDEX `finance_investment_cash_flows_holding_date_idx` ON `finance_investment_cash_flows` (`holding_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_finance_recurring_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`category_id` integer,
	`amount` integer NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`note` text,
	`linked_goal_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_recurring_rules`("id", "type", "account_id", "to_account_id", "category_id", "amount", "frequency", "start_date", "end_date", "note", "linked_goal_id", "created_at") SELECT "id", "type", "account_id", "to_account_id", "category_id", CAST(ROUND("amount" * 100) AS INTEGER), "frequency", "start_date", "end_date", "note", "linked_goal_id", "created_at" FROM `finance_recurring_rules`;--> statement-breakpoint
DROP TABLE `finance_recurring_rules`;--> statement-breakpoint
ALTER TABLE `__new_finance_recurring_rules` RENAME TO `finance_recurring_rules`;--> statement-breakpoint
CREATE TABLE `__new_finance_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`account_id` integer NOT NULL,
	`to_account_id` integer,
	`category_id` integer,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`recurring_rule_id` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recurring_rule_id`) REFERENCES `finance_recurring_rules`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_finance_transactions`("id", "type", "account_id", "to_account_id", "category_id", "amount", "date", "note", "recurring_rule_id", "created_at") SELECT "id", "type", "account_id", "to_account_id", "category_id", CAST(ROUND("amount" * 100) AS INTEGER), "date", "note", "recurring_rule_id", "created_at" FROM `finance_transactions`;--> statement-breakpoint
DROP TABLE `finance_transactions`;--> statement-breakpoint
ALTER TABLE `__new_finance_transactions` RENAME TO `finance_transactions`;--> statement-breakpoint
CREATE INDEX `finance_transactions_account_date_idx` ON `finance_transactions` (`account_id`,`date`);--> statement-breakpoint
CREATE INDEX `finance_transactions_category_date_idx` ON `finance_transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `finance_transactions_recurring_rule_idx` ON `finance_transactions` (`recurring_rule_id`);