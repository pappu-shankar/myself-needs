CREATE TABLE `finance_allocation_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_class` text NOT NULL,
	`target_percentage` real NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_allocation_targets_asset_class_unique` ON `finance_allocation_targets` (`asset_class`);--> statement-breakpoint
CREATE TABLE `finance_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`date_of_birth` text,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
