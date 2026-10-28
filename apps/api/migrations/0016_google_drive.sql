CREATE TABLE `drive_connections` (
	`studio_id` text PRIMARY KEY NOT NULL,
	`google_sub` text NOT NULL,
	`email` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`scope` text NOT NULL,
	`root_folder_id` text,
	`status` text DEFAULT 'ok' NOT NULL,
	`default_for_new_events` integer DEFAULT false NOT NULL,
	`missing_files` integer DEFAULT 0 NOT NULL,
	`checked_at` text,
	`connected_by` text NOT NULL,
	`connected_at` text NOT NULL,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `drive_import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`file_id` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`album_id` text NOT NULL,
	`status` text DEFAULT 'waiting' NOT NULL,
	`photo_id` text,
	`error` text,
	FOREIGN KEY (`import_id`) REFERENCES `drive_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_import_items_import_idx` ON `drive_import_items` (`import_id`,`status`);--> statement-breakpoint
CREATE TABLE `drive_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`quality` text NOT NULL,
	`watermark` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`total` integer NOT NULL,
	`done` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`albums_created` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drive_imports_event_idx` ON `drive_imports` (`event_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `albums` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `events` ADD `originals_in` text DEFAULT 'frameline' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `storage` text DEFAULT 'r2' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `drive_file_id` text;--> statement-breakpoint
CREATE INDEX `photos_drive_file_idx` ON `photos` (`event_id`,`drive_file_id`);