CREATE TABLE `studio_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`studio_id` text NOT NULL,
	`kind` text NOT NULL,
	`method` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider_order_id` text NOT NULL,
	`provider_payment_id` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`paid_at` text,
	FOREIGN KEY (`studio_id`) REFERENCES `studios`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `studio_payments_provider_uq` ON `studio_payments` (`provider_order_id`);--> statement-breakpoint
CREATE INDEX `studio_payments_studio_idx` ON `studio_payments` (`studio_id`,`created_at`);