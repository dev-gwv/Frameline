-- Galleries for events dated more than a year before they were made closed to guests at once (expiry was the
-- event date + 365 days). Give each at least a year from when it was made.
UPDATE `events` SET `expires_at` = strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+365 days')
WHERE `expires_at` < strftime('%Y-%m-%dT%H:%M:%fZ', `created_at`, '+365 days');
