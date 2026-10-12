DROP INDEX `qrs_slug_uq`;--> statement-breakpoint
-- Short links are global now (GALLERY_URL/q/<slug>). Two studios may already share a slug: the oldest QR keeps it,
-- the others get their id's last 6 characters appended (the studio can rename it in Smart QR).
UPDATE `smart_qrs` SET `slug` = substr(`slug`, 1, 25) || '-' || substr(`id`, -6)
WHERE `id` NOT IN (SELECT `id` FROM `smart_qrs` q WHERE q.`created_at` = (SELECT min(`created_at`) FROM `smart_qrs` WHERE `slug` = q.`slug`) GROUP BY q.`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `qrs_slug_global_uq` ON `smart_qrs` (`slug`);
