CREATE TABLE `health_body_measurements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`site` text NOT NULL,
	`value` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_body_measurements_site_date_idx` ON `health_body_measurements` (`site`,`date`);--> statement-breakpoint
CREATE TABLE `health_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalog_key` text,
	`name` text NOT NULL,
	`body_part` text NOT NULL,
	`equipment` text NOT NULL,
	`target` text NOT NULL,
	`secondary_muscles` text DEFAULT '[]' NOT NULL,
	`instructions` text DEFAULT '[]' NOT NULL,
	`default_mode` text DEFAULT 'reps' NOT NULL,
	`is_bodyweight` integer DEFAULT false NOT NULL,
	`is_unilateral` integer DEFAULT false NOT NULL,
	`is_custom` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`notes` text,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_exercises_catalog_key_idx` ON `health_exercises` (`catalog_key`) WHERE "health_exercises"."catalog_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `health_exercises_name_idx` ON `health_exercises` (`name`);--> statement-breakpoint
CREATE INDEX `health_exercises_body_part_idx` ON `health_exercises` (`body_part`);--> statement-breakpoint
CREATE INDEX `health_exercises_equipment_idx` ON `health_exercises` (`equipment`);--> statement-breakpoint
CREATE TABLE `health_routine_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routine_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`position` integer NOT NULL,
	`mode` text DEFAULT 'reps' NOT NULL,
	`sets` integer DEFAULT 3 NOT NULL,
	`reps` integer,
	`reps_min` integer,
	`weight_kg` real,
	`duration_sec` integer,
	`distance_km` real,
	`rest_sec` integer,
	`superset_group` integer,
	`per_side` integer DEFAULT false NOT NULL,
	`is_bodyweight` integer DEFAULT false NOT NULL,
	`progression_policy` text,
	`increment_kg` real,
	`target_rpe` real,
	`scheme` text DEFAULT 'standard' NOT NULL,
	`notes` text,
	FOREIGN KEY (`routine_id`) REFERENCES `health_routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `health_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_routine_exercises_routine_idx` ON `health_routine_exercises` (`routine_id`,`position`);--> statement-breakpoint
CREATE INDEX `health_routine_exercises_exercise_idx` ON `health_routine_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `health_routines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`progression_policy` text DEFAULT 'linear' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_schedule_overrides` (
	`date` text PRIMARY KEY NOT NULL,
	`routine_id` integer,
	`note` text,
	FOREIGN KEY (`routine_id`) REFERENCES `health_routines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `health_week_schedule` (
	`weekday` integer PRIMARY KEY NOT NULL,
	`routine_id` integer,
	FOREIGN KEY (`routine_id`) REFERENCES `health_routines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `health_programs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`weeks` integer NOT NULL,
	`set_ramp_per_week` integer DEFAULT 0 NOT NULL,
	`deload_final_week` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`ended_at` text,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_programs_status_idx` ON `health_programs` (`status`);--> statement-breakpoint
CREATE TABLE `health_training_maxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exercise_id` integer NOT NULL,
	`training_max_kg` real NOT NULL,
	`effective_from` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `health_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `health_training_maxes_exercise_idx` ON `health_training_maxes` (`exercise_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `health_workout_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_id` integer NOT NULL,
	`exercise_id` integer NOT NULL,
	`routine_exercise_id` integer,
	`position` integer NOT NULL,
	`mode` text DEFAULT 'reps' NOT NULL,
	`superset_group` integer,
	`per_side` integer DEFAULT false NOT NULL,
	`is_bodyweight` integer DEFAULT false NOT NULL,
	`target_sets` integer,
	`target_reps` integer,
	`target_reps_min` integer,
	`target_weight_kg` real,
	`target_duration_sec` integer,
	`target_distance_km` real,
	`target_rpe` real,
	`rest_sec` integer,
	`progression_policy` text,
	`prescription_kind` text,
	`prescription_reason` text,
	`notes` text,
	FOREIGN KEY (`workout_id`) REFERENCES `health_workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `health_exercises`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `health_workout_exercises_workout_idx` ON `health_workout_exercises` (`workout_id`,`position`);--> statement-breakpoint
CREATE INDEX `health_workout_exercises_exercise_idx` ON `health_workout_exercises` (`exercise_id`);--> statement-breakpoint
CREATE TABLE `health_workout_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_exercise_id` integer NOT NULL,
	`position` integer NOT NULL,
	`kind` text DEFAULT 'working' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`duration_sec` integer,
	`distance_km` real,
	`rir` real,
	`rpe` real,
	`completed` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`tracked_by` text DEFAULT 'manual' NOT NULL,
	`rom_score` real,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `health_workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `health_workout_sets_entry_idx` ON `health_workout_sets` (`workout_exercise_id`,`position`);--> statement-breakpoint
CREATE TABLE `health_workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`routine_id` integer,
	`name` text NOT NULL,
	`session_rpe` real,
	`notes` text,
	`source` text DEFAULT 'app' NOT NULL,
	`import_source` text,
	`import_ref` text,
	`program_id` integer,
	`program_week` integer,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `health_routines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`program_id`) REFERENCES `health_programs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `health_workouts_date_idx` ON `health_workouts` (`date`);--> statement-breakpoint
CREATE INDEX `health_workouts_routine_idx` ON `health_workouts` (`routine_id`);--> statement-breakpoint
CREATE INDEX `health_workouts_finished_idx` ON `health_workouts` (`finished_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `health_workouts_import_ref_idx` ON `health_workouts` (`import_ref`) WHERE "health_workouts"."import_ref" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `health_readiness_checkins` (
	`date` text PRIMARY KEY NOT NULL,
	`sleep_quality` integer NOT NULL,
	`energy` integer NOT NULL,
	`soreness` integer NOT NULL,
	`stress` integer NOT NULL,
	`motivation` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_gym_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`sex` text,
	`height_cm` real,
	`goal_weight_kg` real,
	`effort_scale` text DEFAULT 'none' NOT NULL,
	`default_rest_sec` integer DEFAULT 90 NOT NULL,
	`e1rm_formula` text DEFAULT 'epley' NOT NULL,
	`bar_weight_kg` real DEFAULT 20 NOT NULL,
	`plates_kg` text DEFAULT '[25,20,15,10,5,2.5,1.25]' NOT NULL,
	`owned_equipment` text DEFAULT '[]' NOT NULL,
	`weekly_session_goal` integer DEFAULT 3 NOT NULL,
	`sleep_target_hours` real DEFAULT 8 NOT NULL,
	`ask_bodyweight_on_start` integer DEFAULT true NOT NULL,
	`keep_awake` integer DEFAULT true NOT NULL,
	`rest_sound` integer DEFAULT true NOT NULL,
	`rest_notifications` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_volume_landmarks` (
	`muscle` text PRIMARY KEY NOT NULL,
	`mev` integer NOT NULL,
	`mav_low` integer NOT NULL,
	`mav_high` integer NOT NULL,
	`mrv` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `health_gym_dismissed_insights` (
	`id` text PRIMARY KEY NOT NULL,
	`dismissed_at` text DEFAULT (current_timestamp) NOT NULL
);
