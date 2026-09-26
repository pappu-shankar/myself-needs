CREATE TABLE `fashion_generation_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`outfit_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`comfyui_prompt_id` text,
	`error_message` text,
	`started_at` text,
	`finished_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`outfit_id`) REFERENCES `fashion_outfits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fashion_generation_jobs_outfit_idx` ON `fashion_generation_jobs` (`outfit_id`);--> statement-breakpoint
CREATE TABLE `fashion_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`filename` text NOT NULL,
	`original_name` text,
	`mime_type` text NOT NULL,
	`width_px` integer NOT NULL,
	`height_px` integer NOT NULL,
	`skin_tone_lab_l` real,
	`skin_tone_lab_a` real,
	`skin_tone_lab_b` real,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fashion_outfits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`photo_id` integer NOT NULL,
	`name` text NOT NULL,
	`shirt_color_hex` text NOT NULL,
	`pants_color_hex` text NOT NULL,
	`shirt_contrast_score` text,
	`pants_contrast_score` text,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`photo_id`) REFERENCES `fashion_photos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fashion_outfits_photo_idx` ON `fashion_outfits` (`photo_id`);--> statement-breakpoint
CREATE TABLE `fashion_reference_sheets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`composite_filename` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `fashion_generation_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fashion_reference_sheet_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_sheet_id` integer NOT NULL,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`reference_sheet_id`) REFERENCES `fashion_reference_sheets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fashion_reference_sheet_images_sheet_idx` ON `fashion_reference_sheet_images` (`reference_sheet_id`);