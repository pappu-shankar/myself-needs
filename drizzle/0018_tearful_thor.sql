CREATE TABLE `house_furniture` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`width` real NOT NULL,
	`depth` real NOT NULL,
	`height` real NOT NULL,
	`rotation_degrees` real DEFAULT 0 NOT NULL,
	`color` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `house_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_furniture_room_idx` ON `house_furniture` (`room_id`);--> statement-breakpoint
CREATE TABLE `house_light_fixtures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`x` real DEFAULT 0 NOT NULL,
	`z` real DEFAULT 0 NOT NULL,
	`height` real,
	`color` text,
	`intensity` real,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `house_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_light_fixtures_room_idx` ON `house_light_fixtures` (`room_id`);--> statement-breakpoint
ALTER TABLE `house_wall_styles` ADD `color` text;