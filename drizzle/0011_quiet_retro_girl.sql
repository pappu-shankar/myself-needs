ALTER TABLE `plans_goals` ADD `type` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans_goals` ADD `priority` text DEFAULT 'important' NOT NULL;--> statement-breakpoint
ALTER TABLE `plans_goals` ADD `target_amount` real;--> statement-breakpoint
ALTER TABLE `plans_goals` ADD `progress_percent` real;