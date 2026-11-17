ALTER TABLE `drive_imports` ADD `covered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `covered` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `studios` ADD `sa_cover_plan` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `sa_cover_until` text;--> statement-breakpoint
ALTER TABLE `studios` ADD `sa_cover_photos` integer DEFAULT 0 NOT NULL;