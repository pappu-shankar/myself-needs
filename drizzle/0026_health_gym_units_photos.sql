CREATE TABLE `health_progress_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`pose` text NOT NULL,
	`image` blob NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`landmarks` text,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_progress_photos_pose_date_idx` ON `health_progress_photos` (`pose`,`date`);--> statement-breakpoint
ALTER TABLE `health_gym_settings` ADD `weight_unit` text DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE `health_gym_settings` ADD `voice_coach` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `health_gym_settings` ADD `camera_auto_log` integer DEFAULT true NOT NULL;