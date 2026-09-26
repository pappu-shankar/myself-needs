CREATE TABLE `house_floors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`name` text NOT NULL,
	`level` integer DEFAULT 0 NOT NULL,
	`floor_height` real DEFAULT 3 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `house_projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_floors_project_idx` ON `house_floors` (`project_id`);--> statement-breakpoint
CREATE TABLE `house_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`roof_type` text DEFAULT 'gabled' NOT NULL,
	`roof_pitch_degrees` real,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `house_rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`floor_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`width` real NOT NULL,
	`depth` real NOT NULL,
	`wall_height` real,
	`color` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`floor_id`) REFERENCES `house_floors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_rooms_floor_idx` ON `house_rooms` (`floor_id`);