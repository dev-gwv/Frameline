CREATE TABLE `camera_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`camera_id` text NOT NULL,
	`filename` text NOT NULL,
	`at` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text NOT NULL,
	`photo_id` text,
	`error` text,
	FOREIGN KEY (`camera_id`) REFERENCES `cameras`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `camera_uploads_idx` ON `camera_uploads` (`camera_id`,`at`);--> statement-breakpoint
CREATE TABLE `guest_links` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`at` text NOT NULL,
	`description` text NOT NULL,
	`kind` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`invoice_number` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `purchases_studio_idx` ON `purchases` (`studio_id`,`at`);--> statement-breakpoint
CREATE TABLE `renewal_links` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`price_paise` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `studio_follows` (
	`studio_id` text NOT NULL,
	`follower_key` text NOT NULL,
	`at` text NOT NULL,
	PRIMARY KEY(`studio_id`, `follower_key`)
);
--> statement-breakpoint
CREATE TABLE `usage_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`ready_at` text,
	`csv` text
);
--> statement-breakpoint
CREATE INDEX `usage_reports_idx` ON `usage_reports` (`studio_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `zip_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`album_id` text,
	`photo_ids` text,
	`email` text NOT NULL,
	`photo_count` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`requested_at` text NOT NULL,
	`ready_at` text,
	`url` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `zips_event_idx` ON `zip_requests` (`event_id`,`requested_at`);--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `broadcasts` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `cameras` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `enquiries` ADD `status` text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE `enquiries` ADD `event_id` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `notification_prefs` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `photo_ids` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `buyer_email` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `method` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `review_status` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `enhanced_from` text;--> statement-breakpoint
CREATE INDEX `photos_r2key_idx` ON `photos` (`r2_key`);--> statement-breakpoint
ALTER TABLE `smart_qrs` ADD `scheduled_event_id` text;--> statement-breakpoint
ALTER TABLE `smart_qrs` ADD `scheduled_at` text;--> statement-breakpoint
ALTER TABLE `smart_qrs` ADD `dot_style` text;--> statement-breakpoint
ALTER TABLE `smart_qrs` ADD `logo_url` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `cover_url` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `studio_type` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `referral_source` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `profile` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `app` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `followers` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `coupons_redeemed` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `store_settings` text;--> statement-breakpoint
CREATE UNIQUE INDEX `studios_follow_uq` ON `studios` (`follow_code`);--> statement-breakpoint
ALTER TABLE `uploads` ADD `options` text;