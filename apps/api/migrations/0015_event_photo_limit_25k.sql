-- Payments are off: events get the new 25,000-photo limit (EVENT_PHOTO_LIMIT; originals count twice).
UPDATE `events` SET `photo_limit` = 25000 WHERE `photo_limit` < 25000;
