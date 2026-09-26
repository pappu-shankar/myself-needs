CREATE TABLE `finance_insurance_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`policy_number` text,
	`sum_assured` real,
	`premium_amount` real NOT NULL,
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
