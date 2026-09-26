CREATE TABLE `fashion_garments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`filename` text NOT NULL,
	`original_name` text,
	`mime_type` text NOT NULL,
	`representative_color_lab_l` real NOT NULL,
	`representative_color_lab_a` real NOT NULL,
	`representative_color_lab_b` real NOT NULL,
	`representative_color_hex` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fashion_physiques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`ratios_json` text NOT NULL,
	`categories_json` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `fashion_photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fashion_physiques_photo_idx` ON `fashion_physiques` (`photo_id`);