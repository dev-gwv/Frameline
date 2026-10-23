-- Custom SQL migration file, put your code below! --
-- Payments are off (23 Oct): events still on the old default of 2,000 photos get the new 10,000 (EVENT_PHOTO_LIMIT).
-- Events that bought a pack are above 2,000 and keep their limit.
UPDATE `events` SET `photo_limit` = 10000 WHERE `photo_limit` = 2000;
