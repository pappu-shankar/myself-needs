CREATE TABLE `mental_medication_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`medication_id` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`medication_id`) REFERENCES `mental_medications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mental_medication_logs_medication_date_idx` ON `mental_medication_logs` (`medication_id`,`date`);--> statement-breakpoint
CREATE TABLE `mental_medications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`dosage` text,
	`frequency` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
