CREATE TABLE `download_events` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`photo_id` text NOT NULL,
	`guest_id` text,
	`kind` text NOT NULL,
	`filename` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `download_events_event_idx` ON `download_events` (`event_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `photos` ADD `copied_from` text;--> statement-breakpoint
ALTER TABLE `zip_requests` ADD `guest_id` text;