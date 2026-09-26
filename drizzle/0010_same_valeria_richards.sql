CREATE TABLE `health_symptoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`severity` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_medications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dosage` text,
	`frequency` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_medication_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medication_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `health_medications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_medication_logs_medication_date_idx` ON `health_medication_logs` (`medication_id`,`date`);--> statement-breakpoint
ALTER TABLE `health_metrics` ADD `type` text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `health_metrics` ADD `unit` text;