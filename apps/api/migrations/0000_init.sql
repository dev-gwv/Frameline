CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `access_event_idx` ON `access_requests` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_studio_idx` ON `activity` (`studio_id`,`at`);--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`studio_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`kind` text DEFAULT 'album' NOT NULL,
	`cover_photo_id` text,
	`first_capture` text,
	`last_capture` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `albums_event_idx` ON `albums` (`event_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text,
	`user_id` text,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`meta` text,
	`ip` text,
	`request_id` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_studio_idx` ON `audit_log` (`studio_id`,`at`);--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text NOT NULL,
	`sent_at` text,
	`scheduled_at` text,
	`open_rate` real,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `broadcasts_studio_idx` ON `broadcasts` (`studio_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cameras` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`label` text NOT NULL,
	`event_id` text NOT NULL,
	`album_id` text NOT NULL,
	`mode` text NOT NULL,
	`ftp_user` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`today` integer DEFAULT 0 NOT NULL,
	`last_file` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cameras_studio_idx` ON `cameras` (`studio_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cameras_ftp_uq` ON `cameras` (`ftp_user`);--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`message` text NOT NULL,
	`source` text NOT NULL,
	`note` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `enquiries_studio_idx` ON `enquiries` (`studio_id`,`at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`short_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`end_date` text,
	`city` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`photo_limit` integer DEFAULT 2000 NOT NULL,
	`visits` text NOT NULL,
	`face_matches` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`cover_tones` text NOT NULL,
	`cover_photo_id` text,
	`settings` text NOT NULL,
	`hosts` text DEFAULT '[]' NOT NULL,
	`highlights` integer DEFAULT true NOT NULL,
	`plan` text DEFAULT 'subscription' NOT NULL,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_short_uq` ON `events` (`short_id`);--> statement-breakpoint
CREATE INDEX `events_studio_idx` ON `events` (`studio_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `faces` (
	`id` text PRIMARY KEY NOT NULL,
	`photo_id` text NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text,
	`box` text NOT NULL,
	`vector_id` text,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `faces_person_idx` ON `faces` (`person_id`,`photo_id`);--> statement-breakpoint
CREATE INDEX `faces_photo_idx` ON `faces` (`photo_id`);--> statement-breakpoint
CREATE TABLE `films` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `films_event_idx` ON `films` (`event_id`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'guest' NOT NULL,
	`favourites` text DEFAULT '[]' NOT NULL,
	`last_active` text NOT NULL,
	`registered_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guests_event_idx` ON `guests` (`event_id`,`last_active`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`scope_key` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`state` text NOT NULL,
	`status_code` integer,
	`response_body` text,
	`response_type` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idem_expires_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`at` text NOT NULL,
	`description` text NOT NULL,
	`type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`balance_paise` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_studio_idx` ON `ledger_entries` (`studio_id`,`at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`event_ids` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`last_active_at` text,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_uq` ON `memberships` (`studio_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`number` integer NOT NULL,
	`buyer` text NOT NULL,
	`event_id` text NOT NULL,
	`event_name` text NOT NULL,
	`items` text NOT NULL,
	`paid_paise` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`share_paise` integer NOT NULL,
	`status` text NOT NULL,
	`provider_ref` text,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `orders_studio_idx` ON `orders` (`studio_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_uq` ON `orders` (`studio_id`,`number`);--> statement-breakpoint
CREATE TABLE `otp_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `otp_email_idx` ON `otp_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`tone` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `people_event_idx` ON `people` (`event_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`album_id` text NOT NULL,
	`studio_id` text NOT NULL,
	`filename` text NOT NULL,
	`seq` integer NOT NULL,
	`captured_at` text NOT NULL,
	`tone` text NOT NULL,
	`url` text,
	`r2_key` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`favourites` integer DEFAULT 0 NOT NULL,
	`downloads` integer DEFAULT 0 NOT NULL,
	`faces` text DEFAULT '[]' NOT NULL,
	`exif` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`source` text DEFAULT 'web' NOT NULL,
	`quality` text DEFAULT 'web' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_event_capture_idx` ON `photos` (`event_id`,`captured_at`,`id`);--> statement-breakpoint
CREATE INDEX `photos_album_capture_idx` ON `photos` (`album_id`,`captured_at`,`id`);--> statement-breakpoint
CREATE INDEX `photos_album_name_idx` ON `photos` (`album_id`,`filename`,`id`);--> statement-breakpoint
CREATE INDEX `photos_album_seq_idx` ON `photos` (`album_id`,`seq`,`id`);--> statement-breakpoint
CREATE INDEX `photos_event_status_idx` ON `photos` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `prices` (
	`studio_id` text NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`detail` text NOT NULL,
	`price_paise` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`studio_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`family_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`revoked_reason` text,
	`replaced_by` text,
	`user_agent` text,
	`ip` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `refresh_hash_uq` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE INDEX `refresh_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `smart_qrs` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`event_id` text NOT NULL,
	`target` text DEFAULT 'web' NOT NULL,
	`scans` integer DEFAULT 0 NOT NULL,
	`color` text DEFAULT '#1B1712' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `qrs_slug_uq` ON `smart_qrs` (`studio_id`,`slug`);--> statement-breakpoint
CREATE TABLE `studios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`handle` text NOT NULL,
	`logo_url` text,
	`brand_color` text DEFAULT '#8C2F39' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`website` text,
	`instagram` text,
	`city` text DEFAULT '' NOT NULL,
	`follow_code` text NOT NULL,
	`about` text,
	`plan_id` text DEFAULT 'starter' NOT NULL,
	`plan_period` text DEFAULT 'yearly' NOT NULL,
	`valid_till` text NOT NULL,
	`photos_used` integer DEFAULT 0 NOT NULL,
	`photos_limit` integer DEFAULT 50000 NOT NULL,
	`guest_reserved` integer DEFAULT 0 NOT NULL,
	`wallet_paise` integer DEFAULT 0 NOT NULL,
	`renewal_multiplier` real DEFAULT 2 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studios_handle_uq` ON `studios` (`handle`);--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`event_ids` text DEFAULT '[]' NOT NULL,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invites_email_idx` ON `team_invites` (`email`);--> statement-breakpoint
CREATE INDEX `invites_studio_idx` ON `team_invites` (`studio_id`);--> statement-breakpoint
CREATE TABLE `ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender` text NOT NULL,
	`body` text NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_messages_idx` ON `ticket_messages` (`ticket_id`,`at`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`subject` text NOT NULL,
	`event_id` text,
	`platform` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tickets_studio_idx` ON `tickets` (`studio_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`event_id` text NOT NULL,
	`album_id` text NOT NULL,
	`user_id` text NOT NULL,
	`quality` text NOT NULL,
	`mode` text NOT NULL,
	`files` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`google_sub` text,
	`email_verified_at` text,
	`created_at` text NOT NULL,
	`last_active_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_uq` ON `users` (`google_sub`);--> statement-breakpoint
CREATE TABLE `watermarks` (
	`studio_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `websites` (
	`studio_id` text PRIMARY KEY NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`template` text DEFAULT 'editorial' NOT NULL,
	`headline` text DEFAULT '' NOT NULL,
	`sections` text NOT NULL,
	`custom_domain` text,
	`updated_at` text NOT NULL
);
