CREATE TABLE `event_daily_stats` (
	`event_id` text NOT NULL,
	`day` text NOT NULL,
	`studio_id` text NOT NULL,
	`visits` integer DEFAULT 0 NOT NULL,
	`downloads` integer DEFAULT 0 NOT NULL,
	`face_searches` integer DEFAULT 0 NOT NULL,
	`photo_views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`event_id`, `day`)
);
--> statement-breakpoint
CREATE INDEX `daily_stats_studio_idx` ON `event_daily_stats` (`studio_id`,`day`);--> statement-breakpoint
CREATE TABLE `notify_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`studio_id` text NOT NULL,
	`phone` text NOT NULL,
	`created_at` text NOT NULL,
	`notified_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notify_event_phone_uq` ON `notify_requests` (`event_id`,`phone`);--> statement-breakpoint
CREATE INDEX `notify_pending_idx` ON `notify_requests` (`notified_at`,`cancelled_at`);--> statement-breakpoint
ALTER TABLE `access_requests` ADD `guest_id` text;--> statement-breakpoint
ALTER TABLE `albums` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `albums_deleted_idx` ON `albums` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `cameras` ADD `last_upload_at` text;--> statement-breakpoint
ALTER TABLE `guests` ADD `removed_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `tracking_number` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `link_sent_at` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `views` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `rotation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `faces_indexed_at` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `deleted_at` text;--> statement-breakpoint
CREATE INDEX `photos_deleted_idx` ON `photos` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `smart_qrs` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `whatsapp` text;--> statement-breakpoint
UPDATE `photos` SET `faces_indexed_at` = `created_at` WHERE `status` = 'ready';