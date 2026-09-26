CREATE TABLE `house_fixtures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`floor_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`floor_id`) REFERENCES `house_floors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_fixtures_floor_idx` ON `house_fixtures` (`floor_id`);--> statement-breakpoint
CREATE TABLE `house_openings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`wall` text NOT NULL,
	`type` text NOT NULL,
	`offset` real DEFAULT 0 NOT NULL,
	`width` real NOT NULL,
	`height` real,
	`sill_height` real,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `house_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_openings_room_idx` ON `house_openings` (`room_id`);--> statement-breakpoint
CREATE TABLE `house_stairs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`from_floor_id` integer NOT NULL,
	`to_floor_id` integer NOT NULL,
	`name` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`width` real NOT NULL,
	`run` real NOT NULL,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `house_projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_floor_id`) REFERENCES `house_floors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_floor_id`) REFERENCES `house_floors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_stairs_project_idx` ON `house_stairs` (`project_id`);