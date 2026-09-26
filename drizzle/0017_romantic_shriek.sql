CREATE TABLE `house_wall_styles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`wall` text NOT NULL,
	`style` text NOT NULL,
	`railing_height` real,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `house_rooms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `house_wall_styles_room_idx` ON `house_wall_styles` (`room_id`);--> statement-breakpoint
ALTER TABLE `house_openings` ADD `style` text;--> statement-breakpoint
ALTER TABLE `house_stairs` ADD `railing_side` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE `house_stairs` ADD `railing_height` real;