ALTER TABLE `studios` ADD `on_trial` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Studios still on the 14-day trial they were set up with (no plan bought, valid_till within ~2 weeks of sign-up).
UPDATE `studios` SET `on_trial` = 1 WHERE julianday(`valid_till`) - julianday(`created_at`) <= 15
  AND `id` NOT IN (SELECT `studio_id` FROM `purchases` WHERE `kind` = 'plan');
