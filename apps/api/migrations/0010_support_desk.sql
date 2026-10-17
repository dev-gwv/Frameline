ALTER TABLE `tickets` ADD `category` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `urgency` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `ai_state` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `escalated_at` text;--> statement-breakpoint
ALTER TABLE `tickets` ADD `resolved_at` text;--> statement-breakpoint
CREATE INDEX `tickets_ai_idx` ON `tickets` (`ai_state`,`updated_at`);--> statement-breakpoint
-- Tickets from before the support desk are not answered by the assistant after the fact.
UPDATE `tickets` SET `ai_state` = 'off';
