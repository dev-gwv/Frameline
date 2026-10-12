CREATE TABLE `partner_links` (
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`external_id` text NOT NULL,
	`local_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`provider`, `kind`, `external_id`)
);
--> statement-breakpoint
CREATE INDEX `partner_links_local_idx` ON `partner_links` (`provider`,`kind`,`local_id`);