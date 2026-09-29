DROP INDEX `finance_budgets_category_effective_idx`;--> statement-breakpoint
-- Hand-added: drop exact duplicates (same category + effective date) before enforcing uniqueness, keeping the newest.
DELETE FROM `finance_budgets` WHERE `id` NOT IN (SELECT MAX(`id`) FROM `finance_budgets` GROUP BY `category_id`, `effective_from`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_budgets_category_effective_idx` ON `finance_budgets` (`category_id`,`effective_from`);--> statement-breakpoint
DROP INDEX `finance_investment_valuations_holding_date_idx`;--> statement-breakpoint
-- Hand-added: one price per holding per day; keep the newest of any same-day duplicates.
DELETE FROM `finance_investment_valuations` WHERE `id` NOT IN (SELECT MAX(`id`) FROM `finance_investment_valuations` GROUP BY `holding_id`, `date`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_investment_valuations_holding_date_idx` ON `finance_investment_valuations` (`holding_id`,`date`);--> statement-breakpoint
ALTER TABLE `finance_tax_settings` ADD `fiscal_year` text DEFAULT '2024-25' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_tax_settings_fy_idx` ON `finance_tax_settings` (`fiscal_year`);--> statement-breakpoint
ALTER TABLE `finance_tax_slabs` ADD `fiscal_year` text DEFAULT '2024-25' NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_tax_slabs_fy_regime_idx` ON `finance_tax_slabs` (`fiscal_year`,`regime`);--> statement-breakpoint
ALTER TABLE `finance_investment_cash_flows` ADD `units` real;--> statement-breakpoint
ALTER TABLE `finance_transactions` ADD `period_start` text;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_transactions_rule_period_idx` ON `finance_transactions` (`recurring_rule_id`,`period_start`) WHERE "finance_transactions"."recurring_rule_id" IS NOT NULL AND "finance_transactions"."period_start" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `finance_transactions_to_account_date_idx` ON `finance_transactions` (`to_account_id`,`date`);--> statement-breakpoint
CREATE INDEX `finance_transactions_date_idx` ON `finance_transactions` (`date`);