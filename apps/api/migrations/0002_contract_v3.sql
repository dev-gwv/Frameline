CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`file_name` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_studio_idx` ON `assets` (`studio_id`,`kind`);--> statement-breakpoint
CREATE TABLE `download_uses` (
	`event_id` text NOT NULL,
	`guest_key` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `guest_key`)
);
--> statement-breakpoint
CREATE TABLE `guest_galleries` (
	`guest_key` text NOT NULL,
	`event_id` text NOT NULL,
	`last_opened_at` text NOT NULL,
	PRIMARY KEY(`guest_key`, `event_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guest_galleries_key_idx` ON `guest_galleries` (`guest_key`,`last_opened_at`);--> statement-breakpoint
ALTER TABLE `events` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `guest_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `shipping` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `reminded_at` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `reminder_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `billing` text;--> statement-breakpoint
CREATE INDEX `follows_key_idx` ON `studio_follows` (`follower_key`);